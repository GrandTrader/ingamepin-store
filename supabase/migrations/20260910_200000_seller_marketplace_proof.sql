BEGIN;
ALTER TABLE public.seller_accounts
 ADD COLUMN IF NOT EXISTS first_name text,
 ADD COLUMN IF NOT EXISTS surname text,
 ADD COLUMN IF NOT EXISTS marketplace_proof_path text;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('seller-marketplace-proofs', 'seller-marketplace-proofs', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- No client storage policies: uploads and administrator downloads use guarded server actions.
COMMIT;
