-- Run only AFTER the password-renewal application release is live.
-- This does not change timestamps or passwords.
begin;
update public.account_password_policy set enabled = true where id;
commit;
select enabled as annual_password_expiry_enabled from public.account_password_policy where id;
