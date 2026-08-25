alter table public.payments
  add column if not exists gateway_checkout_url text;

comment on column public.payments.gateway_checkout_url is
  'Private hosted checkout URL returned by redirect-based payment APIs.';
