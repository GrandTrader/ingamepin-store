create or replace function public.sync_product_price_from_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id uuid;
  lowest_option_price numeric;
begin
  target_product_id := coalesce(new.product_id, old.product_id);

  select min(selling_price)
  into lowest_option_price
  from public.product_options
  where product_id = target_product_id
    and is_active = true
    and is_custom_value = false
    and selling_price is not null
    and selling_price > 0;

  if lowest_option_price is not null then
    update public.products
    set price = lowest_option_price,
        updated_at = now()
    where id = target_product_id
      and price is distinct from lowest_option_price;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_product_price_after_option_change
on public.product_options;

create trigger sync_product_price_after_option_change
after insert or update or delete on public.product_options
for each row execute function public.sync_product_price_from_options();

update public.products as product
set price = option_price.lowest_price,
    updated_at = now()
from (
  select product_id, min(selling_price) as lowest_price
  from public.product_options
  where is_active = true
    and is_custom_value = false
    and selling_price is not null
    and selling_price > 0
  group by product_id
) as option_price
where product.id = option_price.product_id
  and product.price is distinct from option_price.lowest_price;
