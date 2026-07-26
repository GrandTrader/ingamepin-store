alter table public.products
add column if not exists bulk_delivery_instructions text;

comment on column public.products.bulk_delivery_instructions is
  'Customer-facing delivery information shown only when the product is in bulk order mode.';
