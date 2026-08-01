with target_product as (
  select id
  from public.products
  where slug = 'marvel-tokon-fighting-souls'
),
verified_sales as (
  select
    target_product.id as product_id,
    coalesce(sum(order_items.quantity), 0)::integer as quantity
  from target_product
  left join public.order_items
    on order_items.product_id = target_product.id
  left join public.orders
    on orders.id = order_items.order_id
   and orders.status in ('PAID', 'PROCESSING', 'DELIVERED')
  group by target_product.id
)
update public.products as product
set sold_count = greatest(0, 73 - verified_sales.quantity),
    updated_at = now()
from verified_sales
where product.id = verified_sales.product_id;
