begin;

alter table public.affiliate_accounts
  add column if not exists commission_override_percent numeric(5,2);

alter table public.affiliate_accounts
  drop constraint if exists affiliate_accounts_commission_override_percent_check;

alter table public.affiliate_accounts
  add constraint affiliate_accounts_commission_override_percent_check
  check (
    commission_override_percent is null
    or commission_override_percent between 0.01 and 25
  );

comment on column public.affiliate_accounts.commission_override_percent is
  'Optional promoter-specific commission percentage. NULL uses the product affiliate commission percentage.';

commit;
