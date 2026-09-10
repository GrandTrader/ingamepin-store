BEGIN;
CREATE TABLE public.didit_seller_test_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE RESTRICT,
 application_submitted_at timestamptz NOT NULL,
 workflow_id uuid NOT NULL,
 session_id uuid UNIQUE,
 session_url text,
 provider_status text NOT NULL DEFAULT 'Creating',
 environment text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
 face_score numeric CHECK (face_score BETWEEN 0 AND 100),
 checks_passed boolean NOT NULL DEFAULT false,
 consent_version text NOT NULL,
 consent_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(seller_id, application_submitted_at, workflow_id)
);
ALTER TABLE public.didit_seller_test_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.didit_seller_test_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.didit_seller_test_sessions TO service_role;
COMMENT ON TABLE public.didit_seller_test_sessions IS 'Sandbox only. Stores session links privately and minimal simulated results. Never grants seller verification or approval.';
COMMIT;
