alter table public.product_options
  add column if not exists digiseller_product_id bigint;

create index if not exists product_options_digiseller_product_id_idx
  on public.product_options (digiseller_product_id)
  where digiseller_product_id is not null;

comment on column public.product_options.digiseller_product_id is
  'DigiSeller product receiving the available voucher inventory for this denomination.';
