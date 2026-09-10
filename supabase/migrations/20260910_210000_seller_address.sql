BEGIN;
ALTER TABLE public.seller_accounts
 ADD COLUMN IF NOT EXISTS address_line1 text,
 ADD COLUMN IF NOT EXISTS address_line2 text,
 ADD COLUMN IF NOT EXISTS city text,
 ADD COLUMN IF NOT EXISTS district text,
 ADD COLUMN IF NOT EXISTS state_region text,
 ADD COLUMN IF NOT EXISTS postal_code text;
COMMIT;
