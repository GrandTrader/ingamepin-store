-- No products are activated and no external purchase is made by this migration.
-- Reuse the protected supplier queue so payment/refund/cancellation locks apply.
begin;
alter table products drop constraint products_stock_source_check;
alter table products add constraint products_stock_source_check check(stock_source in ('OWNED','DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX'));
alter table definiteplay_jobs drop constraint definiteplay_jobs_provider_check;
alter table definiteplay_jobs add constraint definiteplay_jobs_provider_check check(provider in ('DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX'));

create table wupex_delivery_settings (
 product_id uuid primary key references wupex_imports(product_id),
 delivery_kind text not null check(delivery_kind in ('CODE','ACCOUNT')),
 updated_at timestamptz not null default now(), stock_synced_at timestamptz not null default 'epoch'
);
create table wupex_worker_state (
 id boolean primary key default true check(id), connection_id text not null check(connection_id ~ '^[0-9a-f]{64}$'),
 seen_at timestamptz not null default now()
);
create table wupex_units (
 item_id uuid not null references definiteplay_jobs(item_id), ordinal integer not null check(ordinal between 1 and 1000),
 connection_id text not null, request_key text not null unique,
 submitted_at timestamptz, request_ciphertext text, provider_id text,
 provider_status text check(provider_status in ('in_process','success','error','cancel','refund','unknown')),
 result_ciphertext text, charged_amount numeric(24,8) check(charged_amount>0 and charged_amount::text not in ('NaN','Infinity','-Infinity')),
 primary key(item_id,ordinal), unique(connection_id,provider_id)
);
alter table wupex_delivery_settings enable row level security;
alter table wupex_worker_state enable row level security;
alter table wupex_units enable row level security;
revoke all on wupex_delivery_settings,wupex_worker_state,wupex_units from public,anon,authenticated;
grant select,insert,update,delete on wupex_delivery_settings,wupex_worker_state,wupex_units to service_role;

-- Preserve all installed stock/range rules. Fail atomically on an unknown schema.
do $$ declare fn text; src text; changed text; begin
 foreach fn in array array['reconcile_code_inventory(uuid)','guard_order_item_combined_stock()','guard_definiteplay_codes()','guard_definiteplay_product()'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  changed:=replace(src,$q$in ('DEFINITEPLAY','GIFTPORT','FKWALLET')$q$,$q$in ('DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX')$q$);
  if changed=src then raise exception 'Unrecognised supplier guard: %',fn; end if;
  execute changed;
 end loop;
 src:=pg_get_functiondef('public.guard_definiteplay_item()'::regprocedure);
 changed:=replace(src,'NEW.service_delivered_at is distinct from OLD.service_delivered_at',
  $q$(NEW.service_delivered_at is distinct from OLD.service_delivered_at and not (coalesce(current_setting('app.wupex_delivery',true),'')=OLD.id::text and exists(select 1 from definiteplay_jobs where item_id=OLD.id and provider='WUPEX')))$q$);
 if changed=src then raise exception 'Unrecognised supplier item guard'; end if;
 execute changed;
 src:=pg_get_functiondef('public.complete_definiteplay_job(uuid,uuid,text[],numeric)'::regprocedure);
 changed:=replace(src,$q$case when j.provider='FKWALLET'$q$,$q$case when j.provider='WUPEX' then 'Wupex: ' when j.provider='FKWALLET'$q$);
 if changed=src then raise exception 'Unrecognised supplier receipt function'; end if;
 execute changed;
end $$;

create function configure_wupex_product(p_product_id uuid,p_enabled boolean,p_kind text,p_connection text)
returns void language plpgsql security definer set search_path=public as $$
declare p products%rowtype; imp wupex_imports%rowtype;
begin
 select * into p from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id;
 if p.id is null or imp.product_id is null or p.seller_id is not null or p.stock_source not in ('OWNED','WUPEX') or p_enabled is null then raise exception 'Invalid Wupex product'; end if;
 if exists(select 1 from definiteplay_jobs j join order_items i on i.id=j.item_id join orders o on o.id=j.order_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then raise exception 'Resolve existing supplier orders first'; end if;
 if not p_enabled then
  update products set stock_source='OWNED',delivery_type='MANUAL' where id=p_product_id;
  delete from definiteplay_stock where product_id=p_product_id;
  delete from wupex_delivery_settings where product_id=p_product_id;
  perform reconcile_code_inventory(p_product_id); return;
 end if;
 if p_kind is null or p_kind not in ('CODE','ACCOUNT') or p_connection is distinct from imp.connection_id then raise exception 'Invalid delivery setup'; end if;
 if not exists(select 1 from wupex_worker_state where id and connection_id=p_connection and seen_at>now()-interval '3 minutes') then raise exception 'Start the Wupex delivery worker first'; end if;
 if p.allows_custom_value or p.allows_player_id_topup then raise exception 'Fixed imported options only'; end if;
 if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then raise exception 'Use a separate supplier product'; end if;
 if not exists(select 1 from product_options where product_id=p_product_id and is_active) or
  exists(select 1 from product_options o left join wupex_product_links l on l.option_id=o.id and l.product_id=o.product_id and l.connection_id=imp.connection_id where o.product_id=p_product_id and o.is_active and (l.option_id is null or o.is_custom_value or l.supplier_cost<=0)) then raise exception 'Link every fixed option first'; end if;
 if (select count(*) from product_customer_fields where product_id=p_product_id)<>jsonb_array_length(imp.customer_fields) or
  exists(select 1 from jsonb_array_elements(imp.customer_fields)x where not exists(select 1 from product_customer_fields where id=(x->>'fieldId')::uuid and product_id=p_product_id and field_type=x->>'fieldType' and is_required)) then raise exception 'Restore the imported customer fields first'; end if;
 if exists(select 1 from wupex_product_links where product_id=p_product_id and (supplier_snapshot->>'cardType') is distinct from (case when p_kind='CODE' then 'voucher' else 'topup' end)) then raise exception 'Delivery type does not match supplier products'; end if;
 if p_kind='ACCOUNT' and jsonb_array_length(imp.customer_fields)=0 then raise exception 'Account delivery requires recipient fields'; end if;
 insert into wupex_delivery_settings(product_id,delivery_kind) values(p_product_id,p_kind)
 on conflict(product_id) do update set delivery_kind=excluded.delivery_kind,updated_at=now();
 delete from definiteplay_stock where product_id=p_product_id;
 insert into definiteplay_stock(option_id,product_id,sku,unit_cost)
 select l.option_id,l.product_id,'WX'||l.supplier_product_id,ceil(l.supplier_cost/imp.exchange_rate*100000000)/100000000 from wupex_product_links l where l.product_id=p_product_id;
 update products set stock_source='WUPEX',delivery_type='MANUAL',stock_quantity=0 where id=p_product_id;
 update product_options set stock_quantity=0,is_in_stock=false where product_id=p_product_id;
end $$;

create function sync_wupex_stock(p_product_id uuid,p_connection text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r record; qty integer;
begin
 perform 1 from products where id=p_product_id and stock_source='WUPEX' for update;
 if not found then return; end if;
 if not exists(select 1 from wupex_imports where product_id=p_product_id and connection_id=p_connection) or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid Wupex stock update'; end if;
 for r in select s.option_id,x.value as facts from definiteplay_stock s left join lateral(select value from jsonb_array_elements(p_rows) where value->>'optionId'=s.option_id::text limit 1)x on true where s.product_id=p_product_id loop
  qty:=least(1000,greatest(0,coalesce((r.facts->>'quantity')::integer,0)));
  update definiteplay_stock set available_quantity=qty,synced_at=now() where option_id=r.option_id;
  update product_options set stock_quantity=qty,is_in_stock=qty>0,updated_at=now() where id=r.option_id;
 end loop;
 update products set stock_quantity=coalesce((select sum(stock_quantity)::integer from product_options where product_id=p_product_id and is_active),0),updated_at=now() where id=p_product_id;
 update wupex_delivery_settings set stock_synced_at=now() where product_id=p_product_id;
end $$;

create function snapshot_wupex_order_item() returns trigger language plpgsql security definer set search_path=public as $$
declare imp wupex_imports%rowtype; link wupex_product_links%rowtype; kind text; cost numeric;
begin
 if not exists(select 1 from products where id=NEW.product_id and stock_source='WUPEX') then return NEW; end if;
 if NEW.fulfillment_mode<>'CODE' or NEW.custom_value is not null then raise exception 'Wupex supports fixed imported options only'; end if;
 select * into imp from wupex_imports where product_id=NEW.product_id;
 select * into link from wupex_product_links where option_id=NEW.product_option_id and product_id=NEW.product_id and connection_id=imp.connection_id;
 select delivery_kind into kind from wupex_delivery_settings where product_id=NEW.product_id;
 select unit_cost into cost from definiteplay_stock where option_id=NEW.product_option_id;
 if link.option_id is null or kind is null or cost is null or cost<=0 then raise exception 'Wupex delivery is not configured'; end if;
 if not exists(select 1 from wupex_worker_state where id and connection_id=imp.connection_id and seen_at>now()-interval '3 minutes') then raise exception 'Wupex delivery is temporarily unavailable'; end if;
 insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,provider,supplier_payload)
 values(NEW.id,NEW.order_id,'IGPWX'||replace(NEW.id::text,'-',''),'WX'||link.supplier_product_id,NEW.quantity,cost,'WUPEX',
  jsonb_build_object('connectionId',imp.connection_id,'productId',link.supplier_product_id,
   'supplierCost',link.supplier_cost,'currency',link.supplier_currency,'exchangeRate',imp.exchange_rate,'deliveryKind',kind,
   'sku',link.supplier_snapshot->>'sku','cardType',link.supplier_snapshot->>'cardType','subType',link.supplier_snapshot->'subType','productName',link.supplier_snapshot->>'name','fieldMap',imp.customer_fields,'customerInformation',coalesce(NEW.customer_information,'[]'::jsonb)));
 insert into wupex_units(item_id,ordinal,connection_id,request_key)
 select NEW.id,n,imp.connection_id,'igpwx-'||NEW.id::text||'-'||n from generate_series(1,NEW.quantity)n;
 return NEW;
end $$;
create trigger snapshot_wupex_order_item after insert on order_items for each row execute function snapshot_wupex_order_item();

create function mark_wupex_unit_submitted(p_item_id uuid,p_token uuid,p_ordinal integer,p_request text)
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype; o orders%rowtype;
begin
 select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.state not in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') then raise exception 'Lease was lost'; end if;
 if o.paid_at is null or o.currency<>'USD' or o.status not in ('PAID','PROCESSING') or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) then raise exception 'Payment is not verified'; end if;
 if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') or exists(select 1 from order_refund_requests where order_id=o.id and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Order has a refund hold'; end if;
 if o.subtotal<=0 or j.max_unit_cost*j.quantity> (select total_price from order_items where id=p_item_id)*greatest(o.subtotal-o.discount,0)/o.subtotal then raise exception 'Supplier cost exceeds net sale'; end if;
 if exists(select 1 from wupex_units where item_id=p_item_id and ordinal<p_ordinal and provider_status is distinct from 'success') then raise exception 'Complete the previous unit first'; end if;
 if coalesce(length(p_request),0) not between 10 and 100000 then raise exception 'Save the encrypted request first'; end if;
 update wupex_units set submitted_at=now(),request_ciphertext=p_request where item_id=p_item_id and ordinal=p_ordinal and submitted_at is null;
 if not found then raise exception 'This purchase was already submitted'; end if;
 update definiteplay_jobs set submitted_at=coalesce(submitted_at,now()),state='SUBMITTED',updated_at=now() where item_id=p_item_id;
end $$;

create function record_wupex_unit(p_item_id uuid,p_token uuid,p_ordinal integer,p_provider_id text,p_status text,p_amount numeric,p_result text)
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype;
begin
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() then raise exception 'Lease was lost'; end if;
 if coalesce(p_provider_id,'')!~'^[A-Za-z0-9_-]{1,100}$' or p_status is null or p_status not in ('in_process','success','error','cancel','refund','unknown') or coalesce(length(p_result),0) not between 10 and 100000 then raise exception 'Invalid supplier result'; end if;
 if p_status='success' and (p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount>(j.supplier_payload->>'supplierCost')::numeric) then raise exception 'Supplier charge requires review'; end if;
 update wupex_units set provider_id=p_provider_id,provider_status=p_status,charged_amount=p_amount,result_ciphertext=p_result
 where item_id=p_item_id and ordinal=p_ordinal and submitted_at is not null and (provider_id is null or provider_id=p_provider_id) and provider_status is distinct from 'success';
 if not found then raise exception 'Purchase result is already final or does not match'; end if;
end $$;

create function complete_wupex_job(p_item_id uuid,p_token uuid,p_codes text[])
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype; o orders%rowtype; cost numeric;
begin
 select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.state='DELIVERED' then return; end if;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.submitted_at is null then raise exception 'Lease was lost'; end if;
 if o.status not in ('PAID','PROCESSING') or o.paid_at is null or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) then raise exception 'Payment is not verified'; end if;
 if (select count(*) from wupex_units where item_id=p_item_id and provider_status='success' and charged_amount>0)<>j.quantity then raise exception 'Supplier has not confirmed every unit'; end if;
 if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') or exists(select 1 from order_refund_requests where order_id=o.id and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Resolve the refund first'; end if;
 select ceil(sum(charged_amount)/(j.supplier_payload->>'exchangeRate')::numeric*100000000)/100000000 into cost from wupex_units where item_id=p_item_id;
 if cost is null or cost<=0 or cost>j.max_unit_cost*j.quantity then raise exception 'Supplier charge exceeds budget'; end if;
 if j.supplier_payload->>'deliveryKind'='CODE' then
  perform complete_definiteplay_job(p_item_id,p_token,p_codes,cost); return;
 end if;
 if j.supplier_payload->>'deliveryKind' is distinct from 'ACCOUNT' or cardinality(p_codes) is distinct from 0 or exists(select 1 from gift_card_codes where order_item_id=p_item_id) then raise exception 'Invalid account delivery'; end if;
 perform set_config('app.wupex_delivery',p_item_id::text,true);
 update order_items set service_delivered_at=now() where id=p_item_id and service_delivered_at is null;
 if not found then raise exception 'Item already delivered'; end if;
 update definiteplay_jobs set state='DELIVERED',actual_cost=cost,issue=null,lease_token=null,lease_until=null,updated_at=now() where item_id=p_item_id;
 if not exists(select 1 from order_items i where i.order_id=o.id and i.service_delivered_at is null and
  (select count(*) from gift_card_codes c where c.order_item_id=i.id and c.status='SOLD')+coalesce((select sum(r.quantity) from order_item_refunds r where r.order_item_id=i.id and r.status<>'CANCELLED'),0)<i.quantity) then
  update orders set status='DELIVERED',delivered_at=now(),updated_at=now() where id=o.id;
 else update orders set status='PROCESSING',updated_at=now() where id=o.id; end if;
end $$;

-- Freeze imported mappings/recipient forms while automatic delivery is enabled.
create function guard_wupex_configuration() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='WUPEX' and not exists(select 1 from wupex_delivery_settings where product_id=NEW.id) then raise exception 'Use the Wupex supplier tab first'; end if;
  if OLD.stock_source='WUPEX' and NEW.stock_source not in ('WUPEX','OWNED') then raise exception 'Disable Wupex delivery first'; end if;
 else
  pid:=case when TG_OP='INSERT' then NEW.product_id else OLD.product_id end;
  if exists(select 1 from products where id=pid and stock_source='WUPEX') then raise exception 'Disable Wupex delivery before changing supplier links or customer fields'; end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create trigger guard_wupex_source before update of stock_source on products for each row execute function guard_wupex_configuration();
create trigger guard_wupex_import before update or delete on wupex_imports for each row execute function guard_wupex_configuration();
create trigger guard_wupex_link before update or delete on wupex_product_links for each row execute function guard_wupex_configuration();
create trigger guard_wupex_customer_field before insert or update or delete on product_customer_fields for each row execute function guard_wupex_configuration();

revoke all on function configure_wupex_product(uuid,boolean,text,text),sync_wupex_stock(uuid,text,jsonb),snapshot_wupex_order_item(),mark_wupex_unit_submitted(uuid,uuid,integer,text),record_wupex_unit(uuid,uuid,integer,text,text,numeric,text),complete_wupex_job(uuid,uuid,text[]),guard_wupex_configuration() from public,anon,authenticated;
grant execute on function configure_wupex_product(uuid,boolean,text,text),sync_wupex_stock(uuid,text,jsonb),mark_wupex_unit_submitted(uuid,uuid,integer,text),record_wupex_unit(uuid,uuid,integer,text,text,numeric,text),complete_wupex_job(uuid,uuid,text[]) to service_role;

-- Keep the purchased denomination tied to its reviewed supplier SKU.
create function guard_wupex_option() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from wupex_product_links where option_id=OLD.id) and
   (TG_OP='DELETE' or NEW.product_id is distinct from OLD.product_id or NEW.denomination is distinct from OLD.denomination or
    NEW.denomination_currency is distinct from OLD.denomination_currency or NEW.is_custom_value is distinct from OLD.is_custom_value or
    NEW.option_type is distinct from OLD.option_type) then
  raise exception 'Import a new Wupex option instead of changing the linked denomination';
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create trigger guard_wupex_option before update or delete on product_options for each row execute function guard_wupex_option();
revoke all on function guard_wupex_option() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
