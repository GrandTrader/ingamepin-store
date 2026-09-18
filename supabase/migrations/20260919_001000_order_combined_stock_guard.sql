begin;
-- Guard every new order line, including repeated denomination lines and bulk orders.
create or replace function public.guard_order_item_combined_stock()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_mode integer; v_available bigint; v_requested bigint; v_product uuid;
begin
  if NEW.quantity is null or NEW.quantity<1 then raise exception 'The cart quantity is invalid.'; end if;
  select product_id into v_product from public.product_options where id=NEW.product_option_id;
  if not found or v_product is distinct from NEW.product_id then raise exception 'The product denomination is invalid.'; end if;
  -- Serialize additions to one order; separate unpaid orders do not reserve stock.
  perform 1 from public.orders where id=NEW.order_id for update;
  select stock_quantity into v_mode from public.products where id=NEW.product_id;
  if v_mode=2147483647 then return NEW; end if;
  select count(*) into v_available from public.gift_card_codes
    where product_id=NEW.product_id and product_option_id=NEW.product_option_id
      and status='AVAILABLE';
  select coalesce(sum(quantity),0)+NEW.quantity into v_requested from public.order_items
    where order_id=NEW.order_id and product_option_id=NEW.product_option_id;
  if v_requested>v_available then
    raise exception 'Only % code(s) are available for this denomination. Combined requested quantity: %.',v_available,v_requested;
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_order_item_combined_stock() from public,anon,authenticated;
drop trigger if exists order_item_combined_stock_guard on public.order_items;
create trigger order_item_combined_stock_guard before insert on public.order_items
for each row execute function public.guard_order_item_combined_stock();
notify pgrst,'reload schema';
commit;
