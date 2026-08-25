with option_limits as (
  select
    product_id,
    min(minimum_quantity) filter (where minimum_quantity is not null) as minimum_quantity,
    max(maximum_quantity) filter (where maximum_quantity is not null) as maximum_quantity
  from public.product_options
  group by product_id
)
update public.products as product
set
  minimum_quantity = least(
    coalesce(product.minimum_quantity, 1),
    coalesce(option_limits.minimum_quantity, product.minimum_quantity, 1)
  ),
  maximum_quantity = greatest(
    coalesce(product.maximum_quantity, 1),
    coalesce(option_limits.maximum_quantity, product.maximum_quantity, 1)
  )
from option_limits
where product.id = option_limits.product_id;

comment on column public.products.maximum_quantity is
  'Product-wide validation envelope. Individual denomination limits are stored on product_options.';
