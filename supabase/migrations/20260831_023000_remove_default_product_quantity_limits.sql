alter table public.products
  alter column minimum_quantity set default 1,
  alter column maximum_quantity set default 2147483647;

update public.products
set
  minimum_quantity = 1,
  maximum_quantity = 2147483647,
  updated_at = now()
where minimum_quantity = 1
  and maximum_quantity in (5, 10);

comment on column public.products.maximum_quantity is
  'Global quantity envelope. 2147483647 means unrestricted; denomination-specific limits belong to product_options.';

