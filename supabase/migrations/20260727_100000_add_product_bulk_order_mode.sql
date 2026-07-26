alter table public.products
add column if not exists is_bulk_order boolean not null default false;

comment on column public.products.is_bulk_order is
  'When true, the product is presented to customers as available for bulk orders.';
