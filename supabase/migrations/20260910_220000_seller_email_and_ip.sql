BEGIN;
ALTER TABLE public.seller_accounts ADD COLUMN IF NOT EXISTS submission_ip inet;
ALTER TABLE public.seller_accounts DROP CONSTRAINT seller_approval_requires_verification;
ALTER TABLE public.seller_accounts ADD CONSTRAINT seller_approval_requires_verification CHECK (
    status <> 'APPROVED' OR (
      nullif(btrim(legal_name), '') IS NOT NULL AND country_code IS NOT NULL AND
      nullif(btrim(phone_number), '') IS NOT NULL AND
      email_verified_at IS NOT NULL AND
      identity_verified_at IS NOT NULL AND physical_id_verified_at IS NOT NULL AND
      face_liveness_verified_at IS NOT NULL AND
      (NOT sells_on_other_marketplaces OR marketplace_statement_verified_at IS NOT NULL) AND
      declaration_version IS NOT NULL AND declaration_accepted_at IS NOT NULL AND
      submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
    )
  );
COMMENT ON COLUMN public.seller_accounts.submission_ip IS 'Most recent application submission connection IP reported by trusted hosting edge; may be a proxy. Not proof of identity.';
COMMIT;
