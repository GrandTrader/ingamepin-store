alter table public.payment_gateway_settings
add column if not exists store_usd_rub_rate numeric(12, 4) not null default 85
  check (store_usd_rub_rate >= 1 and store_usd_rub_rate <= 1000);

update public.payment_gateway_settings
set store_usd_rub_rate = coalesce(store_usd_rub_rate, pally_usd_rub_rate, 85)
where id = true;
