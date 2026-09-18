begin;

-- Recount after the transaction, so older fulfillment functions that also
-- decrement stock cannot double-subtract codes sold in the same transaction.
create or replace function public.reconcile_code_inventory(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_stock integer;
begin
  select stock_quantity into v_stock from public.products where id=p_product_id for update;
  if not found or v_stock=2147483647 then return; end if;
  update public.product_options o
  set stock_quantity=(select count(*)::integer from public.gift_card_codes c
      where c.product_id=p_product_id and c.product_option_id=o.id and c.status='AVAILABLE'),
      updated_at=now()
  where o.product_id=p_product_id and o.stock_quantity is distinct from
    (select count(*)::integer from public.gift_card_codes c
      where c.product_id=p_product_id and c.product_option_id=o.id and c.status='AVAILABLE');
  select count(*)::integer into v_stock from public.gift_card_codes
    where product_id=p_product_id and status='AVAILABLE';
  update public.products set stock_quantity=v_stock,updated_at=now()
    where id=p_product_id and stock_quantity is distinct from v_stock;
end;
$$;
revoke all on function public.reconcile_code_inventory(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_code_inventory(uuid) to service_role;

create or replace function public.sync_changed_code_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' and OLD.product_id is not distinct from NEW.product_id
      and OLD.product_option_id is not distinct from NEW.product_option_id
      and OLD.status is not distinct from NEW.status then return null; end if;
  -- Lock moved products in stable order.
  if TG_OP='UPDATE' and OLD.product_id is distinct from NEW.product_id then
    perform public.reconcile_code_inventory(least(OLD.product_id,NEW.product_id));
    perform public.reconcile_code_inventory(greatest(OLD.product_id,NEW.product_id));
  elsif TG_OP='DELETE' then
    perform public.reconcile_code_inventory(OLD.product_id);
  else
    perform public.reconcile_code_inventory(NEW.product_id);
  end if;
  return null;
end;
$$;
revoke all on function public.sync_changed_code_inventory() from public,anon,authenticated;
drop trigger if exists sync_code_inventory_after_change on public.gift_card_codes;
create constraint trigger sync_code_inventory_after_change
  after insert or update or delete on public.gift_card_codes
  deferrable initially deferred for each row
  execute function public.sync_changed_code_inventory();

-- Repair existing totals while preventing code changes during the recount.
lock table public.gift_card_codes in share row exclusive mode;
do $$ declare r record; begin
  for r in select id from public.products where stock_quantity<>2147483647 order by id loop
    perform public.reconcile_code_inventory(r.id);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
