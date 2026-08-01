alter table public.payment_gateway_settings
add column if not exists store_usd_inr_rate numeric(18, 4) not null default 102;

comment on column public.payment_gateway_settings.store_usd_inr_rate is
  'Number of Indian rupees displayed per one USD on the storefront.';
