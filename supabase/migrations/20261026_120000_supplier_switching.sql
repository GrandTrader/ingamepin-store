-- Supplier switching is explicit and atomic. This migration changes no products.
begin;
create table if not exists public.product_supplier_settings (
 product_id uuid primary key references products(id) on delete cascade,
 provider text not null check(provider in ('DEFINITEPLAY','WUPEX','FKWALLET')),
 selection jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists public.product_supplier_changes (
 id uuid primary key, product_id uuid not null references products(id), admin_id uuid not null references auth.users(id),
 previous_provider text not null, provider text not null, previous_options jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
alter table product_supplier_settings enable row level security;
alter table product_supplier_changes enable row level security;
revoke all on product_supplier_settings,product_supplier_changes from public,anon,authenticated;
grant select,insert,update on product_supplier_settings,product_supplier_changes to service_role;

create or replace function public.product_supplier_version(p_product_id uuid) returns text
language sql security definer set search_path=public as $$
 select md5(jsonb_build_object('source',p.stock_source,'category',p.category_id,'region',p.region,'custom',p.allows_custom_value,'player',p.allows_player_id_topup,
 'options',(select coalesce(jsonb_agg(jsonb_build_array(o.id,o.option_name,o.denomination,o.denomination_currency,o.option_type,o.is_active,o.is_custom_value,o.selling_price) order by o.id),'[]') from product_options o where o.product_id=p.id),
 'fields',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from product_customer_fields f where f.product_id=p.id),
 'dp_links',(select coalesce(jsonb_agg(jsonb_build_array(s.option_id,s.sku) order by s.option_id),'[]') from definiteplay_stock s where s.product_id=p.id),
 'wx_links',(select coalesce(jsonb_agg(jsonb_build_array(s.option_id,s.supplier_product_id) order by s.option_id),'[]') from wupex_product_links s where s.product_id=p.id),
 'fk_links',(select coalesce(jsonb_agg(jsonb_build_array(s.option_id,s.supplier_product_id) order by s.option_id),'[]') from fkwallet_product_links s where s.product_id=p.id),
 'selection',(select selection from product_supplier_settings where product_id=p.id))::text)
 from products p where p.id=p_product_id;
$$;
revoke all on function product_supplier_version(uuid) from public,anon,authenticated;
grant execute on function product_supplier_version(uuid) to service_role;

create or replace function public.apply_product_supplier_configuration(p_request_id uuid,p_product_id uuid,p_admin_id uuid,p_version text,p_provider text,p_connection text,p_draft jsonb,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p products%rowtype; r jsonb; f jsonb; oid uuid; fid uuid; fields jsonb:='[]'; kept uuid[]:='{}';
 maps jsonb:='[]'; saved_selection jsonb; saved_options jsonb:='[]'; previous_options jsonb; result jsonb; previous product_supplier_changes%rowtype;
 n integer:=0; markup numeric; rate numeric; kind text; price numeric; old_option product_options%rowtype;
begin
 if p_request_id is null or p_admin_id is null or not exists(select 1 from admin_users where user_id=p_admin_id) then raise exception 'Admin access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into previous from product_supplier_changes where id=p_request_id;
 if found then
  if previous.product_id<>p_product_id or previous.admin_id<>p_admin_id or previous.provider<>p_provider then raise exception 'Switch reference already used'; end if;
  return previous.result;
 end if;
 select * into p from products where id=p_product_id for update;
 if p.id is null or p.seller_id is not null or p.stock_source not in ('OWNED','DEFINITEPLAY','FKWALLET','WUPEX') then raise exception 'Choose a supported store product'; end if;
 -- Block concurrent catalogue edits and purchases while the switch is committed.
 perform 1 from product_options where product_id=p_product_id order by id for update;
 if p_version is distinct from product_supplier_version(p_product_id) then raise exception 'Product changed. Preview denominations again'; end if;
 if p_provider is null or p_provider not in ('DEFINITEPLAY','WUPEX','FKWALLET') or jsonb_typeof(p_draft) is distinct from 'object' or octet_length(p_draft::text)>1000000 or
  jsonb_typeof(p_draft->'options') is distinct from 'array' or jsonb_array_length(p_draft->'options') not between 1 and 50 then raise exception 'Invalid supplier configuration'; end if;
 if p.allows_custom_value or p.allows_player_id_topup or exists(select 1 from product_range_settings where product_id=p_product_id and enabled) then raise exception 'Disable custom ranges before switching fixed denominations'; end if;
 if exists(select 1 from order_items i join orders o on o.id=i.order_id where i.product_id=p_product_id and o.status not in ('DELIVERED','CANCELLED','REFUNDED')) or
  exists(select 1 from definiteplay_jobs j join order_items i on i.id=j.item_id join orders o on o.id=j.order_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then raise exception 'Resolve unfinished website orders before switching or syncing denominations'; end if;
 if exists(select 1 from digiseller_supplier_jobs j join product_options o on o.id=j.option_id where o.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED')) or
  exists(select 1 from digiseller_fkwallet_jobs j join product_options o on o.id=j.option_id where o.product_id=p_product_id and j.state<>'DELIVERED') then raise exception 'Resolve unfinished DigiSeller orders before switching or syncing denominations'; end if;
 if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then raise exception 'Use or remove uploaded available stock before switching supplier'; end if;
 if coalesce(p_draft->>'markup','') !~ '^\d{1,4}([.]\d{1,2})?$' or coalesce(p_draft->>'exchangeRate','') !~ '^\d{1,9}([.]\d{1,8})?$' then raise exception 'Invalid supplier pricing'; end if;
 markup:=(p_draft->>'markup')::numeric; rate:=(p_draft->>'exchangeRate')::numeric; kind:=p_draft->>'kind';
 if markup not between 0 and 1000 or rate<=0 or rate>100000000 or kind is null or kind not in ('CODE','ACCOUNT') or (p_provider='DEFINITEPLAY' and (rate<>1 or kind<>'CODE')) then raise exception 'Invalid supplier pricing or delivery type'; end if;
 if p_provider<>'DEFINITEPLAY' and coalesce(p_connection,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid supplier connection'; end if;
 if jsonb_typeof(p_draft->'customerFields') is distinct from 'array' or jsonb_array_length(p_draft->'customerFields')>10 or
  (select count(distinct x->>'key') from jsonb_array_elements(p_draft->'customerFields')x)<>jsonb_array_length(p_draft->'customerFields') then raise exception 'Invalid recipient fields'; end if;
 if (select count(distinct x->>'supplierKey') from jsonb_array_elements(p_draft->'options')x)<>jsonb_array_length(p_draft->'options') then raise exception 'Duplicate supplier denomination'; end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') into previous_options from product_options o where product_id=p_product_id;
 -- All changes below roll back if any validation, mapping or activation fails.
 update products set stock_source='OWNED' where id=p_product_id;
 delete from definiteplay_stock where product_id=p_product_id;
 if p_provider<>'FKWALLET' then delete from digiseller_fkwallet_products where product_id=p_product_id; end if;
 delete from fkwallet_delivery_settings where product_id=p_product_id;
 delete from wupex_delivery_settings where product_id=p_product_id;
 delete from fkwallet_product_links where product_id=p_product_id;
 delete from wupex_product_links where product_id=p_product_id;
 if p_provider<>'FKWALLET' then delete from fkwallet_imports where product_id=p_product_id; end if;
 if p_provider<>'WUPEX' then delete from wupex_imports where product_id=p_product_id; end if;
 delete from definiteplay_price_rules where option_id in(select id from product_options where product_id=p_product_id);
 -- Retain compatible recipient field IDs; old orders carry their own snapshots.
 for f in select value from jsonb_array_elements(p_draft->'customerFields') loop
  if coalesce(f->>'key','') !~ '^[A-Za-z0-9_-]{1,100}$' or coalesce(length(btrim(f->>'label')),0) not between 1 and 80 or coalesce(f->>'fieldType','') not in ('TEXT','EMAIL','NUMBER','TEXTAREA') or f->'isRequired' is distinct from 'true'::jsonb then raise exception 'Invalid recipient field'; end if;
  select id into fid from product_customer_fields where product_id=p_product_id and label=f->>'label' and field_type::text=f->>'fieldType' order by id limit 1;
  if fid is null then
   fid:=gen_random_uuid();
   insert into product_customer_fields(id,product_id,label,placeholder,field_type,is_required,sort_order)
    values(fid,p_product_id,f->>'label',left(coalesce(f->>'placeholder',''),150), f->>'fieldType',true,jsonb_array_length(fields));
  else update product_customer_fields set is_required=true where id=fid; end if;
  fields:=fields||jsonb_build_array(f||jsonb_build_object('fieldId',fid));
 end loop;
 delete from product_customer_fields where product_id=p_product_id and not exists(select 1 from jsonb_array_elements(fields)x where x->>'fieldId'=id::text);
 if p_provider='WUPEX' then
  insert into wupex_imports(product_id,connection_id,imported_by,markup_percent,exchange_rate,customer_fields) values(p_product_id,p_connection,p_admin_id,markup,rate,fields)
  on conflict(product_id) do update set connection_id=excluded.connection_id,imported_by=excluded.imported_by,markup_percent=excluded.markup_percent,exchange_rate=excluded.exchange_rate,customer_fields=excluded.customer_fields,pricing_synced_at=clock_timestamp();
 elsif p_provider='FKWALLET' then
  if coalesce(p_selection->>'category','') !~ '^[1-9]\d*$' then raise exception 'Choose an FKWallet category'; end if;
  if exists(select 1 from fkwallet_imports where product_id=p_product_id and customer_fields is distinct from fields) then update digiseller_fkwallet_products set ready=false where product_id=p_product_id; end if;
  insert into fkwallet_imports(product_id,connection_id,supplier_category_id,imported_by,markup_percent,exchange_rate,customer_fields) values(p_product_id,p_connection,(p_selection->>'category')::bigint,p_admin_id,markup,rate,fields)
  on conflict(product_id) do update set connection_id=excluded.connection_id,supplier_category_id=excluded.supplier_category_id,imported_by=excluded.imported_by,markup_percent=excluded.markup_percent,exchange_rate=excluded.exchange_rate,customer_fields=excluded.customer_fields,pricing_synced_at=clock_timestamp();
 end if;
 for r in select value from jsonb_array_elements(p_draft->'options') loop
  if coalesce(r->>'supplierKey','') !~ '^[A-Za-z0-9._-]{1,100}$' or coalesce(length(btrim(r->>'name')),0) not between 1 and 150 or
   coalesce(r->>'denomination','') !~ '^\d+([.]\d{1,4})?$' or (r->>'denomination')::numeric<=0 or (r->>'denomination')::numeric>1000000000 or
   coalesce(r->>'currency','') !~ '^[A-Z]{3}$' or coalesce(r->>'supplierCurrency','') !~ '^[A-Z]{3}$' or
   coalesce(r->>'supplierCost','') !~ '^\d+([.]\d{1,8})?$' or (r->>'supplierCost')::numeric<=0 or (r->>'supplierCost')::numeric>100000000 then raise exception 'Invalid supplier denomination'; end if;
  if r->>'supplierCurrency'='USD' and rate<>1 then raise exception 'USD exchange rate must be 1'; end if;
  price:=round((r->>'supplierCost')::numeric/rate*(1+markup/100),2);
  if price<0.01 or price>9999999.99 or price is distinct from (r->>'price')::numeric then raise exception 'Preview price does not match supplier markup'; end if;
  oid:=nullif(r->>'optionId','')::uuid;
  if oid is not null then
   select * into old_option from product_options where id=oid and product_id=p_product_id;
   if not found or oid=any(kept) or old_option.is_custom_value or old_option.denomination is distinct from (r->>'denomination')::numeric or old_option.denomination_currency is distinct from (r->>'currency') then raise exception 'Match only the same denomination and currency, or add a new option'; end if;
   update product_options set option_name=r->>'name',selling_price=price,is_active=true,is_in_stock=false,stock_quantity=0,sort_order=n,updated_at=now() where id=oid;
  else
   oid:=gen_random_uuid();
   insert into product_options(id,product_id,category_id,option_type,option_name,denomination,denomination_currency,selling_price,is_active,is_in_stock,stock_quantity,is_custom_value,sort_order)
    values(oid,p_product_id,p.category_id,'CURRENCY',r->>'name',(r->>'denomination')::numeric,r->>'currency',price,true,false,0,false,n);
  end if;
  kept:=array_append(kept,oid); n:=n+1;
  saved_options:=saved_options||jsonb_build_array(jsonb_build_object('key',r->>'supplierKey','optionId',oid,'name',r->>'name','denomination',r->>'denomination','currency',r->>'currency'));
  if p_provider='DEFINITEPLAY' then
   maps:=maps||jsonb_build_array(jsonb_build_object('optionId',oid,'sku',r->>'supplierKey'));
   insert into definiteplay_price_rules(option_id,sku,base_unit_cost,base_selling_price,last_applied_price) values(oid,r->>'supplierKey',100,100+markup,price);
  else
   if coalesce(r->>'supplierKey','') !~ '^[1-9]\d*$' or jsonb_typeof(r->'supplierSnapshot') is distinct from 'object' then raise exception 'Invalid supplier product snapshot'; end if;
   if p_provider='WUPEX' then
    insert into wupex_product_links(option_id,product_id,connection_id,supplier_product_id,supplier_cost,supplier_currency,supplier_snapshot)
     values(oid,p_product_id,p_connection,(r->>'supplierKey')::bigint,(r->>'supplierCost')::numeric,r->>'supplierCurrency',r->'supplierSnapshot');
   else
    insert into fkwallet_product_links(option_id,product_id,connection_id,supplier_product_id,supplier_cost,supplier_currency,supplier_snapshot)
     values(oid,p_product_id,p_connection,(r->>'supplierKey')::bigint,(r->>'supplierCost')::numeric,r->>'supplierCurrency',r->'supplierSnapshot');
   end if;
  end if;
 end loop;
 update product_options set is_active=false,is_in_stock=false,stock_quantity=0,updated_at=now() where product_id=p_product_id and not(id=any(kept));
 if p_provider='DEFINITEPLAY' then perform configure_definiteplay_product(p_product_id,true,maps);
 elsif p_provider='WUPEX' then perform configure_wupex_product(p_product_id,true,kind,p_connection);
 else perform configure_fkwallet_product(p_product_id,true,kind,p_connection); end if;
 update products set price=(select min(selling_price) from product_options where product_id=p_product_id and is_active),updated_at=now() where id=p_product_id;
 saved_selection:=p_selection||jsonb_build_object('options',saved_options);
 insert into product_supplier_settings(product_id,provider,selection) values(p_product_id,p_provider,saved_selection)
 on conflict(product_id) do update set provider=excluded.provider,selection=excluded.selection,updated_at=now();
 result:=jsonb_build_object('productId',p_product_id,'provider',p_provider,'options',n);
 insert into product_supplier_changes values(p_request_id,p_product_id,p_admin_id,p.stock_source,p_provider,previous_options,result,now());
 return result;
end $$;
revoke all on function apply_product_supplier_configuration(uuid,uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function apply_product_supplier_configuration(uuid,uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

-- New orders hold the product lock until their supplier snapshot is committed.
create or replace function public.lock_supplier_configuration_for_order() returns trigger
language plpgsql security definer set search_path=public as $$
declare src text;
begin
 select stock_source into src from products where id=NEW.product_id for share;
 if src in ('DEFINITEPLAY','WUPEX','FKWALLET') and not exists(select 1 from product_options where id=NEW.product_option_id and product_id=NEW.product_id and is_active) then raise exception 'This supplier denomination is no longer active. Refresh your cart'; end if;
 return NEW;
end $$;
revoke all on function lock_supplier_configuration_for_order() from public,anon,authenticated;
drop trigger if exists a_lock_supplier_configuration on order_items;
create trigger a_lock_supplier_configuration before insert on order_items for each row execute function lock_supplier_configuration_for_order();
-- DigiSeller callbacks participate in the same switch lock.
create or replace function public.lock_supplier_configuration_for_digiseller() returns trigger
language plpgsql security definer set search_path=public as $$
declare pid uuid; src text; expected text;
begin
 select product_id into pid from product_options where id=NEW.option_id;
 select stock_source into src from products where id=pid for share;
 expected:=case when TG_TABLE_NAME='digiseller_supplier_jobs' then 'DEFINITEPLAY' else 'FKWALLET' end;
 if src is distinct from expected or not exists(select 1 from product_options where id=NEW.option_id and is_active) then raise exception 'DigiSeller supplier denomination changed. Refresh the mapping'; end if;
 return NEW;
end $$;
revoke all on function lock_supplier_configuration_for_digiseller() from public,anon,authenticated;
drop trigger if exists a_lock_supplier_configuration on digiseller_supplier_jobs;
create trigger a_lock_supplier_configuration before insert on digiseller_supplier_jobs for each row execute function lock_supplier_configuration_for_digiseller();
drop trigger if exists a_lock_supplier_configuration on digiseller_fkwallet_jobs;
create trigger a_lock_supplier_configuration before insert on digiseller_fkwallet_jobs for each row execute function lock_supplier_configuration_for_digiseller();
-- Archived supplier options cannot be reactivated through the general editor.
create or replace function public.guard_active_supplier_denomination() returns trigger
language plpgsql security definer set search_path=public as $$
declare src text;
begin
 select stock_source into src from products where id=NEW.product_id;
 if NEW.is_active and exists(select 1 from product_supplier_settings where product_id=NEW.product_id) then
  if (src='DEFINITEPLAY' and not exists(select 1 from definiteplay_stock where option_id=NEW.id and product_id=NEW.product_id)) or
     (src='WUPEX' and not exists(select 1 from wupex_product_links where option_id=NEW.id and product_id=NEW.product_id)) or
     (src='FKWALLET' and not exists(select 1 from fkwallet_product_links where option_id=NEW.id and product_id=NEW.product_id)) then
   raise exception 'Use Sync denominations to add options from the active supplier';
  end if;
 end if;
 return NEW;
end $$;
revoke all on function guard_active_supplier_denomination() from public,anon,authenticated;
drop trigger if exists guard_active_supplier_denomination on product_options;
create trigger guard_active_supplier_denomination before insert or update of is_active on product_options for each row execute function guard_active_supplier_denomination();
notify pgrst,'reload schema';
commit;
