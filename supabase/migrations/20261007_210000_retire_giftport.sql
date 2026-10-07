-- Retire the connection without deleting order, payment, or delivered-code history.
begin;
update products set status='INACTIVE',stock_quantity=0 where stock_source='GIFTPORT';
update product_options set is_active=false,is_in_stock=false,stock_quantity=0
 where product_id in (select id from products where stock_source='GIFTPORT');
update definiteplay_stock set available_quantity=0,synced_at=now()
 where product_id in (select id from products where stock_source='GIFTPORT');
update product_range_settings set enabled=false,delivery_mode='MANUAL',supplier=null,supplier_reference=null where supplier='GIFTPORT';
update definiteplay_jobs set state='REVIEW',lease_token=null,lease_until=null,
 issue='Supplier disconnected. Reconcile existing purchases manually; do not resubmit.'
 where provider='GIFTPORT' and state not in ('DELIVERED','REJECTED');

create or replace function public.guard_retired_supplier() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='GIFTPORT' and (NEW.status<>'INACTIVE' or NEW.stock_quantity<>0) then
   raise exception 'Supplier disconnected';
  end if;
 elsif TG_TABLE_NAME='product_options' then
  if (NEW.is_active or NEW.is_in_stock or NEW.stock_quantity<>0) and exists(select 1 from products where id=NEW.product_id and stock_source='GIFTPORT') then
   raise exception 'Supplier disconnected';
  end if;
 elsif TG_TABLE_NAME='order_items' then
  if exists(select 1 from products where id=NEW.product_id and stock_source='GIFTPORT') then
   raise exception 'Supplier disconnected';
  end if;
 elsif TG_TABLE_NAME='definiteplay_jobs' then
  if NEW.provider='GIFTPORT' and NEW.state not in ('DELIVERED','REJECTED','REVIEW') then
   raise exception 'Supplier disconnected';
  end if;
 elsif TG_TABLE_NAME='product_range_settings' then
  if NEW.supplier='GIFTPORT' then raise exception 'Supplier disconnected'; end if;
 end if;
 return NEW;
end $$;
create trigger retired_supplier_product before insert or update on products for each row execute function guard_retired_supplier();
create trigger retired_supplier_option before insert or update on product_options for each row execute function guard_retired_supplier();
create trigger retired_supplier_order before insert or update of product_id,product_option_id,quantity on order_items for each row execute function guard_retired_supplier();
create trigger retired_supplier_job before insert or update on definiteplay_jobs for each row execute function guard_retired_supplier();
create trigger retired_supplier_range before insert or update on product_range_settings for each row execute function guard_retired_supplier();
-- Remove access to retired supplier RPCs even for stale application deployments.
do $$ declare fn record; begin
 for fn in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like '%giftport%') loop
  execute format('revoke execute on function %s from public,anon,authenticated,service_role',fn.signature);
 end loop;
end $$;
commit;
