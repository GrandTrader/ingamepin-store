-- Stage 1: private seller onboarding and product submissions.
-- Does not publish seller products or enable settlements / withdrawals.
BEGIN;

CREATE TABLE public.marketplace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  sales_commission_basis_points integer NOT NULL DEFAULT 150 CHECK (sales_commission_basis_points BETWEEN 0 AND 10000),
  delivery_hold_hours integer NOT NULL DEFAULT 36 CHECK (delivery_hold_hours >= 0),
  trc20_withdrawal_fee_usd numeric(12,2) NOT NULL DEFAULT 5 CHECK (trc20_withdrawal_fee_usd >= 0),
  bep20_withdrawal_fee_usd numeric(12,2) NOT NULL DEFAULT 2.50 CHECK (bep20_withdrawal_fee_usd >= 0),
  solana_withdrawal_fee_usd numeric(12,2) NOT NULL DEFAULT 2.50 CHECK (solana_withdrawal_fee_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketplace_settings(id) VALUES (true);

CREATE TABLE public.seller_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,30}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  legal_name text,
  country_code text CHECK (country_code ~ '^[A-Z]{2}$'),
  phone_number text,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  identity_verified_at timestamptz,
  physical_id_verified_at timestamptz,
  face_liveness_verified_at timestamptz,
  verification_provider text,
  verification_reference text,
  sells_on_other_marketplaces boolean NOT NULL DEFAULT false,
  marketplace_statement_verified_at timestamptz,
  declaration_version text,
  declaration_accepted_at timestamptz,
  gateway_fee_payer text NOT NULL DEFAULT 'SELLER' CHECK (gateway_fee_payer IN ('SELLER', 'BUYER')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_approval_requires_verification CHECK (
    status <> 'APPROVED' OR (
      nullif(btrim(legal_name), '') IS NOT NULL AND country_code IS NOT NULL AND
      nullif(btrim(phone_number), '') IS NOT NULL AND
      email_verified_at IS NOT NULL AND phone_verified_at IS NOT NULL AND
      identity_verified_at IS NOT NULL AND physical_id_verified_at IS NOT NULL AND
      face_liveness_verified_at IS NOT NULL AND
      (NOT sells_on_other_marketplaces OR marketplace_statement_verified_at IS NOT NULL) AND
      declaration_version IS NOT NULL AND declaration_accepted_at IS NOT NULL AND
      submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX seller_username_unique ON public.seller_accounts(lower(username));

-- Evidence is represented by private storage/provider references, never public URLs.
-- The private upload flow and retention policy are implemented during onboarding.
CREATE TABLE public.seller_verification_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL CHECK (evidence_type IN ('IDENTITY_DOCUMENT', 'PHYSICAL_ID_PHOTO', 'FACE_LIVENESS', 'MARKETPLACE_STATEMENT')),
  provider_reference text,
  private_storage_path text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'DELETED')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  delete_after timestamptz NOT NULL,
  deleted_at timestamptz,
  CHECK (delete_after > submitted_at),
  CHECK (status = 'DELETED' OR nullif(provider_reference, '') IS NOT NULL OR nullif(private_storage_path, '') IS NOT NULL)
);
CREATE INDEX seller_evidence_owner ON public.seller_verification_evidence(seller_id);

CREATE TABLE public.seller_category_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'APPROVED' OR (category_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX seller_category_requests_owner ON public.seller_category_requests(seller_id);

-- Approved submissions are not live products until the publishing stage is added.
-- There is deliberately no seller-editable image column: category supplies the image.
CREATE TABLE public.seller_product_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  region text,
  delivery_type public.delivery_type NOT NULL DEFAULT 'MANUAL',
  price_usd numeric(12,2) NOT NULL CHECK (price_usd > 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  bulk_discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (bulk_discount_percent BETWEEN 0 AND 100),
  bulk_minimum_quantity integer NOT NULL DEFAULT 1 CHECK (bulk_minimum_quantity > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),
  product_id uuid UNIQUE REFERENCES public.products(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'APPROVED' OR (submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX seller_product_submissions_owner ON public.seller_product_submissions(seller_id);
CREATE INDEX seller_product_submissions_review ON public.seller_product_submissions(status, created_at);

CREATE OR REPLACE FUNCTION public.guard_seller_product_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('PENDING', 'APPROVED') THEN
    IF NOT EXISTS (SELECT 1 FROM public.seller_accounts WHERE id = NEW.seller_id AND status = 'APPROVED') THEN
      RAISE EXCEPTION 'Seller approval is required before submitting products.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = NEW.category_id AND is_active AND nullif(btrim(image_url), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'Choose an active category with an admin-uploaded image.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_seller_product_submission() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_seller_product_submission BEFORE INSERT OR UPDATE ON public.seller_product_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_seller_product_submission();

-- No direct client writes. Future server actions must authenticate ownership/admin
-- authority before using service_role; sellers cannot approve themselves or products.
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_verification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_category_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_product_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_settings, public.seller_accounts, public.seller_verification_evidence,
  public.seller_category_requests, public.seller_product_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_settings, public.seller_accounts, public.seller_category_requests,
  public.seller_product_submissions TO authenticated;
GRANT ALL ON public.marketplace_settings, public.seller_accounts, public.seller_verification_evidence,
  public.seller_category_requests, public.seller_product_submissions TO service_role;

CREATE POLICY seller_settings_read ON public.marketplace_settings FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.seller_accounts WHERE user_id = auth.uid()));
CREATE POLICY seller_accounts_read ON public.seller_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY seller_category_requests_read ON public.seller_category_requests FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.seller_accounts WHERE id = seller_id AND user_id = auth.uid()));
CREATE POLICY seller_product_submissions_read ON public.seller_product_submissions FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.seller_accounts WHERE id = seller_id AND user_id = auth.uid()));

COMMIT;
