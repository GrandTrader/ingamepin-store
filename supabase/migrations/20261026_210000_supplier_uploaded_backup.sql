-- Fixed supplier vouchers may use uploaded codes for the same option.
-- No external purchases, customer balance changes or historical deliveries are made here.
begin;

alter table public.definiteplay_jobs
 add column if not exists uploaded_backup_only boolean not null default false,
 add column if not exists backup_option_id uuid,
 add column if not exists backup_denomination numeric,
 add column if not exists backup_currency text,
 add column if not exists delivery_source text not null default 'SUPPLIER';
alter table public.definiteplay_jobs drop constraint if exists definiteplay_jobs_max_unit_cost_check;
alter table public.definiteplay_jobs add constraint definiteplay_jobs_max_unit_cost_check
 check ((max_unit_cost>0 or (uploaded_backup_only and max_unit_cost=0))
 and max_unit_cost::text not in ('NaN','Infinity','-Infinity'));
alter table public.definiteplay_jobs drop constraint if exists definiteplay_jobs_delivery_source_check;
alter table public.definiteplay_jobs add constraint definiteplay_jobs_delivery_source_check
 check(delivery_source in ('SUPPLIER','UPLOADED_STOCK'));

create or replace function public.supplier_backup_option(p_option_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from product_options o join products p on p.id=o.product_id
  join definiteplay_stock s on s.option_id=o.id and s.product_id=p.id
  where o.id=p_option_id and o.is_active and not o.is_custom_value and p.seller_id is null
  and (p.stock_source='DEFINITEPLAY'
   or (p.stock_source='WUPEX' and exists(select 1 from wupex_delivery_settings where product_id=p.id and delivery_kind='CODE'))
   or (p.stock_source='FKWALLET' and exists(select 1 from fkwallet_delivery_settings where product_id=p.id and delivery_kind='CODE'))));
$$;

create or replace function public.uploaded_supplier_quantity(p_option_id uuid)
returns integer language sql stable security definer set search_path=public as $$
 select case when supplier_backup_option(p_option_id) then
  (select least(1000,count(*))::integer from gift_card_codes c join product_options o on o.id=c.product_option_id and o.product_id=c.product_id
   where o.id=p_option_id and c.status='AVAILABLE' and c.order_item_id is null and c.denomination is not distinct from o.denomination)
 else 0 end;
$$;

create or replace function public.confirmed_supplier_quantity(p_option_id uuid)
returns integer language sql stable security definer set search_path=public as $$
 select coalesce((select least(1000,greatest(0,s.available_quantity)) from definiteplay_stock s join products p on p.id=s.product_id
 where s.option_id=p_option_id and p.stock_source in ('DEFINITEPLAY','FKWALLET','WUPEX')
 and s.unit_cost>0 and s.synced_at>now()-interval '15 minutes' and s.synced_at<=now()+interval '1 minute'),0);
$$;

-- A line is delivered entirely by one source. Do not add the two quantities.
create or replace function public.supplier_available_quantity(p_option_id uuid)
returns integer language sql stable security definer set search_path=public as $$
 select greatest(confirmed_supplier_quantity(p_option_id),uploaded_supplier_quantity(p_option_id));
$$;

create or replace function public.supplier_backup_inventory(p_product_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('optionId',o.id,'enabled',supplier_backup_option(o.id),
 'uploadedQuantity',(select count(*) from gift_card_codes c where c.product_id=o.product_id and c.product_option_id=o.id
  and c.status='AVAILABLE' and c.order_item_id is null and c.denomination is not distinct from o.denomination),
 'supplierQuantity',confirmed_supplier_quantity(o.id),'availableQuantity',supplier_available_quantity(o.id)) order by o.sort_order,o.id),'[]')
 from product_options o where o.product_id=p_product_id and o.is_active and not o.is_custom_value;
$$;

create or replace function public.reconcile_code_inventory(p_product_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare source text;
begin
 select stock_source into source from products where id=p_product_id for update;
 if source in ('DEFINITEPLAY','FKWALLET','WUPEX') then
  update product_options o set stock_quantity=supplier_available_quantity(o.id),
   is_in_stock=(supplier_available_quantity(o.id)>0),updated_at=now()
  where o.product_id=p_product_id and not o.is_custom_value and
   (o.stock_quantity is distinct from supplier_available_quantity(o.id) or o.is_in_stock is distinct from (supplier_available_quantity(o.id)>0));
  update products p set stock_quantity=coalesce((select sum(o.stock_quantity)::integer from product_options o where o.product_id=p.id and o.is_active),0),updated_at=now()
   where p.id=p_product_id;
 elsif source is distinct from 'GIFTPORT' then perform reconcile_owned_code_inventory(p_product_id);
 end if;
end $$;


-- Deduplicate deferred inventory work for bulk uploads while retaining commit-time counts.
create index if not exists gift_card_codes_supplier_backup_available
 on public.gift_card_codes(product_id,product_option_id,id) where status='AVAILABLE' and order_item_id is null;
create or replace function public.invalidate_supplier_backup_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; k text;
begin
 for pid in select distinct v from unnest(case when TG_OP='INSERT' then array[NEW.product_id]
  when TG_OP='DELETE' then array[OLD.product_id] else array[OLD.product_id,NEW.product_id] end) v loop
  k:='app.backup_reconciled_'||replace(pid::text,'-','');
  if current_setting(k,true)='1' then perform set_config(k,'0',true); end if;
 end loop;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create or replace function public.reconcile_supplier_backup_once(p_product_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare k text:='app.backup_reconciled_'||replace(p_product_id::text,'-','');
begin
 if exists(select 1 from products where id=p_product_id and stock_source in ('DEFINITEPLAY','FKWALLET','WUPEX')) then
  if current_setting(k,true)='1' then return; end if;
  perform reconcile_code_inventory(p_product_id);
  perform set_config(k,'1',true);
 else perform reconcile_code_inventory(p_product_id); end if;
end $$;
drop trigger if exists invalidate_supplier_backup_inventory on public.gift_card_codes;
create trigger invalidate_supplier_backup_inventory before insert or update or delete on public.gift_card_codes
 for each row execute function public.invalidate_supplier_backup_inventory();
drop trigger if exists invalidate_supplier_backup_inventory on public.definiteplay_stock;
create trigger invalidate_supplier_backup_inventory before insert or update or delete on public.definiteplay_stock
 for each row execute function public.invalidate_supplier_backup_inventory();
do $$ declare src text; begin
 src:=pg_get_functiondef('public.sync_changed_code_inventory()'::regprocedure);
 if position('reconcile_supplier_backup_once' in src)=0 then
  execute replace(src,'public.reconcile_code_inventory(','public.reconcile_supplier_backup_once(');
 end if;
end $$;
revoke all on function public.invalidate_supplier_backup_inventory(),public.reconcile_supplier_backup_once(uuid)
 from public,anon,authenticated;

-- Run after the complete supplier sync, including its option/product updates.
create or replace function public.reconcile_supplier_backup_stock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform reconcile_supplier_backup_once(case when TG_OP='DELETE' then OLD.product_id else NEW.product_id end);
 return null;
end $$;
drop trigger if exists reconcile_supplier_backup_stock on public.definiteplay_stock;
create constraint trigger reconcile_supplier_backup_stock after insert or update or delete on public.definiteplay_stock
 deferrable initially deferred for each row execute function public.reconcile_supplier_backup_stock();


-- Snapshot denomination identity at order creation. Older jobs without this
-- evidence remain with their original supplier rather than guessing a currency.
create or replace function public.capture_supplier_backup_identity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 select i.product_option_id,i.denomination,o.denomination_currency
  into NEW.backup_option_id,NEW.backup_denomination,NEW.backup_currency
  from order_items i join product_options o on o.id=i.product_option_id and o.product_id=i.product_id
  where i.id=NEW.item_id and i.fulfillment_mode='CODE' and i.custom_value is null
   and i.denomination is not distinct from o.denomination and supplier_backup_option(o.id);
 return NEW;
end $$;
drop trigger if exists capture_supplier_backup_identity on public.definiteplay_jobs;
create trigger capture_supplier_backup_identity before insert on public.definiteplay_jobs
 for each row execute function public.capture_supplier_backup_identity();
revoke all on function public.capture_supplier_backup_identity() from public,anon,authenticated;

-- A backup-only snapshot never needs supplier funds or a running supplier worker.
create or replace function public.snapshot_uploaded_supplier_backup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.fulfillment_mode='CODE' and NEW.custom_value is null and supplier_backup_option(NEW.product_option_id)
  and confirmed_supplier_quantity(NEW.product_option_id)<NEW.quantity
  and uploaded_supplier_quantity(NEW.product_option_id)>=NEW.quantity then
  insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,provider,uploaded_backup_only,delivery_source)
   select NEW.id,NEW.order_id,'IGPBACK'||replace(NEW.id::text,'-',''),s.sku,NEW.quantity,0,p.stock_source,true,'UPLOADED_STOCK'
   from definiteplay_stock s join products p on p.id=s.product_id where s.option_id=NEW.product_option_id;
 end if;
 return NEW;
end $$;
drop trigger if exists a_snapshot_uploaded_supplier_backup on public.order_items;
create trigger a_snapshot_uploaded_supplier_backup after insert on public.order_items
 for each row execute function public.snapshot_uploaded_supplier_backup();

-- Preserve the installed range branches and supplier receipt protection.
do $migration$
declare src text; changed text; fn text; old text; replacement text;
begin
 foreach fn in array array['snapshot_definiteplay_order_item()','snapshot_fkwallet_order_item()','snapshot_wupex_order_item()'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  if position('uploaded_backup_only' in src)=0 then
   changed:=regexp_replace(src,'\mbegin\M',E'begin\n if exists(select 1 from definiteplay_jobs where item_id=NEW.id and uploaded_backup_only) then return NEW; end if;','i');
   if changed=src then raise exception 'Unknown snapshot function: %',fn; end if;
   execute changed;
  end if;
 end loop;
 src:=pg_get_functiondef('public.guard_order_item_combined_stock()'::regprocedure);
 if position('supplier_available_quantity' in src)=0 then
  old:=$q$if not found or v_stock.synced_at<now()-interval '15 minutes' or v_stock.unit_cost<=0 then raise exception 'Supplier stock is temporarily unavailable'; end if;$q$;
  changed:=replace(src,old,'-- Supplier and uploaded stock are checked together below.');
  changed:=replace(changed,'v_available:=v_stock.available_quantity;','v_available:=supplier_available_quantity(NEW.product_option_id);');
  if changed=src or position(old in changed)>0 or position('supplier_available_quantity' in changed)=0 then raise exception 'Unknown supplier stock guard'; end if;
  execute changed;
 end if;

 src:=pg_get_functiondef('public.guard_definiteplay_codes()'::regprocedure);
 if position('app.supplier_uploaded_delivery' in src)=0 then
  old:=$q$raise exception 'Supplier products cannot accept uploaded codes';$q$;
  replacement:=$q$
    if not supplier_backup_option(NEW.product_option_id) or NEW.status not in ('AVAILABLE','DISABLED')
     or not exists(select 1 from product_options where id=NEW.product_option_id and product_id=NEW.product_id and denomination is not distinct from NEW.denomination)
    then raise exception 'Upload backup codes to an active, matching supplier voucher denomination'; end if;
  $q$;
  changed:=replace(src,old,replacement);
  old:=$q$then raise exception 'Supplier codes cannot be assigned manually'; end if;$q$;
  replacement:=$q$then
   if current_setting('app.supplier_uploaded_delivery',true) is distinct from NEW.order_item_id::text
    or OLD.order_item_id is not null or OLD.status<>'AVAILABLE' or NEW.status<>'SOLD'
    or NEW.product_id is distinct from OLD.product_id or NEW.product_option_id is distinct from OLD.product_option_id
    or NEW.code is distinct from OLD.code or NEW.denomination is distinct from OLD.denomination
   then raise exception 'Supplier codes cannot be assigned manually'; end if;
  end if;
  if TG_OP='UPDATE' and NEW.order_item_id is null and NEW.status in ('AVAILABLE','DISABLED')
   and exists(select 1 from products where id=NEW.product_id and stock_source in ('DEFINITEPLAY','FKWALLET','WUPEX')) then
   if not supplier_backup_option(NEW.product_option_id)
    or not exists(select 1 from product_options where id=NEW.product_option_id and product_id=NEW.product_id and denomination is not distinct from NEW.denomination)
   then raise exception 'Choose a matching supplier voucher denomination for backup stock'; end if;
  end if;$q$;
  changed:=replace(changed,old,replacement);
  if changed=src or position('app.supplier_uploaded_delivery' in changed)=0 then raise exception 'Unknown supplier code guard'; end if;
  execute changed;
 end if;
end $migration$;

create or replace function public.deliver_uploaded_supplier_backup(p_item_id uuid,p_token uuid default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype; o orders%rowtype; i order_items%rowtype; ids uuid[]; previous_flag text;
begin
 select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
 select * into j from definiteplay_jobs where item_id=p_item_id for update;
 if j.item_id is null then return false; end if;
 if j.state='DELIVERED' then return j.delivery_source='UPLOADED_STOCK'; end if;
 if j.provider not in ('DEFINITEPLAY','FKWALLET','WUPEX') or j.state not in ('QUEUED','WAITING')
  or j.submitted_at is not null or o.paid_at is null or o.currency<>'USD' or o.status not in ('PAID','PROCESSING')
  or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total)
  or (p_token is null and coalesce(j.lease_until,'epoch')>=now())
  or (p_token is not null and (j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now()))
 then return false; end if;
 select * into i from order_items where id=p_item_id for update;
 if i.fulfillment_mode<>'CODE' or i.custom_value is not null or i.service_delivered_at is not null
  or i.quantity<>j.quantity or not supplier_backup_option(i.product_option_id)
  or i.product_option_id is distinct from j.backup_option_id or i.denomination is distinct from j.backup_denomination
  or not exists(select 1 from product_options where id=i.product_option_id and product_id=i.product_id
    and denomination is not distinct from j.backup_denomination and denomination_currency=j.backup_currency)
  or not exists(select 1 from products where id=i.product_id and stock_source=j.provider)
  or exists(select 1 from gift_card_codes where order_item_id=i.id)
  or exists(select 1 from order_item_refunds where order_item_id=i.id and status<>'CANCELLED')
  or exists(select 1 from order_refund_requests where order_id=o.id and status in ('REQUESTED','APPROVED','COMPLETED'))
  or exists(select 1 from wupex_units where item_id=i.id and (submitted_at is not null or provider_id is not null or result_ciphertext is not null))
  or exists(select 1 from fkwallet_units where item_id=i.id and (submitted_at is not null or provider_id is not null or result_ciphertext is not null))
 then return false; end if;
 if not j.uploaded_backup_only and confirmed_supplier_quantity(i.product_option_id)>=i.quantity then return false; end if;
 select array_agg(c.id) into ids from
  (select gc.id from gift_card_codes gc join product_options po on po.id=gc.product_option_id
   where gc.product_id=i.product_id and gc.product_option_id=i.product_option_id and gc.status='AVAILABLE'
    and gc.order_item_id is null and gc.denomination is not distinct from po.denomination
   order by gc.id limit i.quantity for update of gc skip locked) c;
 if coalesce(cardinality(ids),0)<>i.quantity then return false; end if;
 previous_flag:=current_setting('app.supplier_uploaded_delivery',true);
 perform set_config('app.supplier_uploaded_delivery',i.id::text,true);
 update gift_card_codes set status='SOLD',order_item_id=i.id,reserved_at=now(),sold_at=now(),
  note=concat_ws(' | ',nullif(note,''),'Uploaded stock backup: '||j.supplier_reference)
 where id=any(ids);
 perform set_config('app.supplier_uploaded_delivery',coalesce(previous_flag,''),true);
 update definiteplay_jobs set state='DELIVERED',delivery_source='UPLOADED_STOCK',actual_cost=null,
  issue='Delivered from uploaded backup stock',lease_token=null,lease_until=null,updated_at=now() where item_id=i.id;
 if not exists(select 1 from order_items oi where oi.order_id=o.id and oi.service_delivered_at is null
  and (select count(*) from gift_card_codes gc where gc.order_item_id=oi.id and gc.status='SOLD')+
   coalesce((select sum(r.quantity) from order_item_refunds r where r.order_item_id=oi.id and r.status<>'CANCELLED'),0)<oi.quantity) then
  update orders set status='DELIVERED',delivered_at=now(),updated_at=now() where id=o.id;
 else update orders set status='PROCESSING',updated_at=now() where id=o.id; end if;
 return true;
end $$;

-- Immediate delivery after the payment transaction has finished updating both rows.
create or replace function public.deliver_paid_supplier_backups()
returns trigger language plpgsql security definer set search_path=public as $$
declare oid uuid; r record;
begin
 if TG_TABLE_NAME='orders' then oid:=NEW.id; else oid:=NEW.order_id; end if;
 for r in select item_id from definiteplay_jobs where order_id=oid and submitted_at is null and state in ('QUEUED','WAITING') order by item_id loop
  perform deliver_uploaded_supplier_backup(r.item_id);
 end loop;
 return null;
end $$;
drop trigger if exists deliver_paid_supplier_backups on public.orders;
create constraint trigger deliver_paid_supplier_backups after insert or update on public.orders
 deferrable initially deferred for each row execute function public.deliver_paid_supplier_backups();
drop trigger if exists deliver_paid_supplier_backups on public.payments;
create constraint trigger deliver_paid_supplier_backups after insert or update on public.payments
 deferrable initially deferred for each row execute function public.deliver_paid_supplier_backups();

-- Also picks up codes uploaded after payment without needing supplier credentials.
create or replace function public.fulfill_uploaded_supplier_backups(p_limit integer default 25)
returns integer language plpgsql security definer set search_path=public as $$
declare r record; delivered integer:=0;
begin
 for r in select j.item_id from definiteplay_jobs j join orders o on o.id=j.order_id
  where j.provider in ('DEFINITEPLAY','FKWALLET','WUPEX') and j.state in ('QUEUED','WAITING') and j.submitted_at is null
   and coalesce(j.lease_until,'epoch')<now() and o.paid_at is not null and o.status in ('PAID','PROCESSING')
   and exists(select 1 from order_items i where i.id=j.item_id and uploaded_supplier_quantity(i.product_option_id)>=i.quantity
    and (j.uploaded_backup_only or confirmed_supplier_quantity(i.product_option_id)<i.quantity))
  order by j.next_check,j.created_at limit greatest(1,least(coalesce(p_limit,25),100)) loop
  if deliver_uploaded_supplier_backup(r.item_id) then delivered:=delivered+1; end if;
 end loop;
 return delivered;
end $$;

do $migration$
declare src text; changed text; fn text;
begin
 src:=pg_get_functiondef('public.claim_supplier_job(text)'::regprocedure);
 if position('deliver_uploaded_supplier_backup' in src)=0 then
  changed:=replace(src,'if j.submitted_at is null and (o.subtotal<=0',
   E'if deliver_uploaded_supplier_backup(j.item_id) then continue; end if;\n    if j.uploaded_backup_only then update definiteplay_jobs set next_check=now()+interval ''1 minute'',issue=''Waiting for uploaded backup stock'' where item_id=j.item_id; continue; end if;\n    if j.submitted_at is null and (o.subtotal<=0');
  -- Backup delivery happens before the supplier cost guard.
  changed:=replace(changed,'if j.submitted_at is null and (o.subtotal<=0',
   'if not j.uploaded_backup_only and j.submitted_at is null and (o.subtotal<=0');
  if changed=src then raise exception 'Unknown supplier queue'; end if;
  execute changed;
 end if;
 -- A backup-only line can never be sent to a supplier, even through a direct RPC.
 foreach fn in array array['mark_definiteplay_submitted(uuid,uuid)','mark_wupex_unit_submitted(uuid,uuid,integer,text)','mark_fkwallet_unit_submitted(uuid,uuid,integer,text)'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  if position('j.uploaded_backup_only' in src)=0 then
   changed:=replace(src,'if j.item_id is null or','if j.uploaded_backup_only or j.item_id is null or');
   if changed=src then raise exception 'Unknown supplier submit guard: %',fn; end if;
   execute changed;
  end if;
 end loop;
 -- Keep uploaded codes when every existing denomination is explicitly matched.
 src:=pg_get_functiondef('public.apply_product_supplier_configuration(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure);
 if position('Match every denomination with uploaded stock' in src)=0 then
  changed:=replace(src,
   $q$if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then raise exception 'Use or remove uploaded available stock before switching supplier'; end if;$q$,
   $q$if exists(select 1 from gift_card_codes where product_id=p_product_id and status='RESERVED') then raise exception 'Resolve reserved codes before switching supplier'; end if;
 if exists(select 1 from gift_card_codes c where c.product_id=p_product_id and c.status='AVAILABLE' and
  (p_draft->>'kind' is distinct from 'CODE' or c.order_item_id is not null or not exists(
   select 1 from jsonb_array_elements(p_draft->'options') x join product_options o on o.id::text=x->>'optionId'
   where o.id=c.product_option_id and o.product_id=c.product_id and o.denomination is not distinct from c.denomination)))
 then raise exception 'Match every denomination with uploaded stock to the same voucher denomination before switching'; end if;$q$);
  if changed=src then raise exception 'Unknown supplier switch guard'; end if; execute changed;
 end if;
 foreach fn in array array['configure_definiteplay_product(uuid,boolean,jsonb)','configure_fkwallet_product(uuid,boolean,text,text)','configure_wupex_product(uuid,boolean,text,text)'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  if position('status in (''AVAILABLE'',''RESERVED'')' in src)>0 then
   changed:=replace(src,$q$status in ('AVAILABLE','RESERVED')$q$,
    case when fn like 'configure_definiteplay%' then $q$status='RESERVED'$q$
    else $q$(status='RESERVED' or (status='AVAILABLE' and p_kind<>'CODE'))$q$ end);
   execute changed;
  end if;
 end loop;
end $migration$;

revoke all on function public.supplier_backup_option(uuid),public.uploaded_supplier_quantity(uuid),
 public.confirmed_supplier_quantity(uuid),public.supplier_available_quantity(uuid),public.supplier_backup_inventory(uuid),
 public.reconcile_supplier_backup_stock(),public.snapshot_uploaded_supplier_backup(),public.deliver_uploaded_supplier_backup(uuid,uuid),
 public.deliver_paid_supplier_backups(),public.fulfill_uploaded_supplier_backups(integer) from public,anon,authenticated;
grant execute on function public.supplier_available_quantity(uuid),public.supplier_backup_inventory(uuid),
 public.deliver_uploaded_supplier_backup(uuid,uuid),public.fulfill_uploaded_supplier_backups(integer) to service_role;

-- Refresh availability only; existing orders are not fulfilled by installing this file.
do $$ declare r record; begin
 for r in select id from products where stock_source in ('DEFINITEPLAY','FKWALLET','WUPEX') order by id loop
  perform reconcile_code_inventory(r.id);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
