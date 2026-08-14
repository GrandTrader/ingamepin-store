begin;

alter table public.product_options
  add column if not exists is_in_stock boolean not null default true;

comment on column public.product_options.is_in_stock is
  'Manual storefront availability switch. Turning it off preserves the option and its voucher inventory.';

create or replace function public.enforce_order_item_option_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_option_id is not null
     and not exists (
       select 1
       from public.product_options as option_row
       where option_row.id = new.product_option_id
         and option_row.product_id = new.product_id
         and option_row.is_active = true
         and option_row.is_in_stock = true
     ) then
    raise exception 'The selected product option is out of stock.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_item_option_in_stock()
  from public, anon, authenticated;

drop trigger if exists enforce_order_item_option_in_stock
  on public.order_items;

create trigger enforce_order_item_option_in_stock
before insert or update of product_id, product_option_id
on public.order_items
for each row
execute function public.enforce_order_item_option_in_stock();

commit;
