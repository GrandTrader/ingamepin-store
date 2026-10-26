-- Keep unmatched active voucher denominations on uploaded stock during supplier switches.
-- Installing this migration does not switch products or deliver existing orders.
begin;

create table if not exists public.product_uploaded_stock_options (
 option_id uuid primary key references public.product_options(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists product_uploaded_stock_options_product on public.product_uploaded_stock_options(product_id);
alter table public.product_uploaded_stock_options enable row level security;
revoke all on public.product_uploaded_stock_options from public,anon,authenticated;
grant select,insert,delete on public.product_uploaded_stock_options to service_role;

create or replace function public.supplier_uploaded_options_to_keep(p_product_id uuid,p_options jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('optionId',o.id,'name',o.option_name,
  'denomination',o.denomination::text,'currency',o.denomination_currency,'price',o.selling_price::text,
  'quantity',stock.quantity) order by o.sort_order,o.id),'[]')
 from product_options o
 cross join lateral (select count(*)::integer quantity from gift_card_codes c where c.product_id=o.product_id
  and c.product_option_id=o.id and c.status='AVAILABLE' and c.order_item_id is null
  and c.denomination is not distinct from o.denomination) stock
 where o.product_id=p_product_id and o.is_active and not o.is_custom_value
  and not exists(select 1 from jsonb_array_elements(p_options) x where x->>'optionId'=o.id::text)
  and (stock.quantity>0 or exists(select 1 from product_uploaded_stock_options u where u.option_id=o.id and u.product_id=o.product_id));
$$;

create or replace function public.supplier_backup_option(p_option_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from product_options o join products p on p.id=o.product_id
  where o.id=p_option_id and o.is_active and not o.is_custom_value and p.seller_id is null
  and (exists(select 1 from definiteplay_stock s where s.option_id=o.id and s.product_id=p.id)
   or exists(select 1 from product_uploaded_stock_options u where u.option_id=o.id and u.product_id=p.id))
  and (p.stock_source='DEFINITEPLAY'
   or (p.stock_source='WUPEX' and exists(select 1 from wupex_delivery_settings where product_id=p.id and delivery_kind='CODE'))
   or (p.stock_source='FKWALLET' and exists(select 1 from fkwallet_delivery_settings where product_id=p.id and delivery_kind='CODE'))));
$$;

create or replace function public.confirmed_supplier_quantity(p_option_id uuid)
returns integer language sql stable security definer set search_path=public as $$
 select coalesce((select least(1000,greatest(0,s.available_quantity)) from definiteplay_stock s join products p on p.id=s.product_id
 where s.option_id=p_option_id and p.stock_source in ('DEFINITEPLAY','FKWALLET','WUPEX')
 and not exists(select 1 from product_uploaded_stock_options u where u.option_id=s.option_id and u.product_id=s.product_id)
 and s.unit_cost>0 and s.synced_at>now()-interval '15 minutes' and s.synced_at<=now()+interval '1 minute'),0);
$$;

create or replace function public.supplier_backup_inventory(p_product_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('optionId',o.id,'enabled',supplier_backup_option(o.id),
 'uploadedOnly',exists(select 1 from product_uploaded_stock_options u where u.option_id=o.id and u.product_id=o.product_id),
 'uploadedQuantity',(select count(*) from gift_card_codes c where c.product_id=o.product_id and c.product_option_id=o.id
  and c.status='AVAILABLE' and c.order_item_id is null and c.denomination is not distinct from o.denomination),
 'supplierQuantity',confirmed_supplier_quantity(o.id),'availableQuantity',supplier_available_quantity(o.id)) order by o.sort_order,o.id),'[]')
 from product_options o where o.product_id=p_product_id and o.is_active and not o.is_custom_value;
$$;

create or replace function public.snapshot_uploaded_supplier_backup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.fulfillment_mode='CODE' and NEW.custom_value is null and supplier_backup_option(NEW.product_option_id)
  and confirmed_supplier_quantity(NEW.product_option_id)<NEW.quantity
  and uploaded_supplier_quantity(NEW.product_option_id)>=NEW.quantity then
  insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,provider,uploaded_backup_only,delivery_source)
   select NEW.id,NEW.order_id,'IGPBACK'||replace(NEW.id::text,'-',''),
    coalesce(s.sku,'UPLOADED.'||replace(o.id::text,'-','')),NEW.quantity,0,p.stock_source,true,'UPLOADED_STOCK'
   from product_options o join products p on p.id=o.product_id
   left join definiteplay_stock s on s.option_id=o.id and s.product_id=o.product_id
   where o.id=NEW.product_option_id and o.product_id=NEW.product_id;
 end if;
 return NEW;
end $$;

-- These local options are private, durable selections; they never need a fake supplier SKU.
create or replace function public.guard_active_supplier_denomination() returns trigger
language plpgsql security definer set search_path=public as $$
declare src text;
begin
 select stock_source into src from products where id=NEW.product_id;
 if NEW.is_active and exists(select 1 from product_supplier_settings where product_id=NEW.product_id) then
  if not NEW.is_custom_value and exists(select 1 from product_uploaded_stock_options u where u.option_id=NEW.id and u.product_id=NEW.product_id)
   and (src='DEFINITEPLAY' or (src='WUPEX' and exists(select 1 from wupex_delivery_settings where product_id=NEW.product_id and delivery_kind='CODE'))
    or (src='FKWALLET' and exists(select 1 from fkwallet_delivery_settings where product_id=NEW.product_id and delivery_kind='CODE'))) then return NEW; end if;
  if (src='DEFINITEPLAY' and not exists(select 1 from definiteplay_stock where option_id=NEW.id and product_id=NEW.product_id)) or
     (src='WUPEX' and not exists(select 1 from wupex_product_links where option_id=NEW.id and product_id=NEW.product_id)) or
     (src='FKWALLET' and not exists(select 1 from fkwallet_product_links where option_id=NEW.id and product_id=NEW.product_id)) then
   raise exception 'Use Sync denominations to add options from the active supplier';
  end if;
 end if;
 return NEW;
end $$;

do $migration$
declare src text; changed text; fn text; old text;
begin
 src:=pg_get_functiondef('public.apply_product_supplier_configuration(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure);
 if position('uploaded_kept_ids' in src)=0 then
  changed:=replace(src,'n integer:=0;', $q$uploaded_kept jsonb:='[]'; uploaded_kept_ids uuid[]:='{}'; n integer:=0;$q$);
  old:=$q$if exists(select 1 from gift_card_codes c where c.product_id=p_product_id and c.status='AVAILABLE' and
  (p_draft->>'kind' is distinct from 'CODE' or c.order_item_id is not null or not exists(
   select 1 from jsonb_array_elements(p_draft->'options') x join product_options o on o.id::text=x->>'optionId'
   where o.id=c.product_option_id and o.product_id=c.product_id and o.denomination is not distinct from c.denomination)))
 then raise exception 'Match every denomination with uploaded stock to the same voucher denomination before switching'; end if;$q$;
  if position(old in changed)=0 then raise exception 'Install the uploaded stock backup update first'; end if;
  changed:=replace(changed,old,$q$if exists(select 1 from gift_card_codes c where c.product_id=p_product_id and c.status='AVAILABLE' and
  (p_draft->>'kind' is distinct from 'CODE' or c.order_item_id is not null or not exists(
   select 1 from product_options o where o.id=c.product_option_id and o.product_id=c.product_id
    and not o.is_custom_value and o.denomination is not distinct from c.denomination)))
 then raise exception 'Uploaded codes must belong to valid fixed voucher denominations before switching'; end if;
 if p_draft->>'kind'='CODE' then
  uploaded_kept:=supplier_uploaded_options_to_keep(p_product_id,p_draft->'options');
  if uploaded_kept is distinct from coalesce(p_draft->'uploadedOptions','[]'::jsonb) then
   raise exception 'Uploaded stock changed. Preview denominations again'; end if;
  if exists(select 1 from jsonb_array_elements(uploaded_kept) u cross join jsonb_array_elements(p_draft->'options') x
   where (u->>'denomination')::numeric=(x->>'denomination')::numeric and u->>'currency'=x->>'currency') then
   raise exception 'Match the existing uploaded denomination instead of creating a duplicate option'; end if;
  select coalesce(array_agg((x->>'optionId')::uuid),'{}') into uploaded_kept_ids from jsonb_array_elements(uploaded_kept)x;
 elsif coalesce(p_draft->'uploadedOptions','[]'::jsonb)<>'[]'::jsonb then
  raise exception 'Uploaded-only denominations require voucher code delivery';
 end if;$q$);
  changed:=replace(changed,$q$update products set stock_source='OWNED' where id=p_product_id;$q$,
   $q$update products set stock_source='OWNED' where id=p_product_id;
 delete from product_uploaded_stock_options where product_id=p_product_id;
 insert into product_uploaded_stock_options(option_id,product_id) select unnest(uploaded_kept_ids),p_product_id;$q$);
  changed:=replace(changed,'update product_options set is_active=false,is_in_stock=false,stock_quantity=0,updated_at=now() where product_id=p_product_id and not(id=any(kept));',
   'kept:=kept||uploaded_kept_ids;
 update product_options set is_active=false,is_in_stock=false,stock_quantity=0,updated_at=now() where product_id=p_product_id and not(id=any(kept));');
  changed:=replace(changed,'update products set price=(select min(selling_price)',
   'perform reconcile_code_inventory(p_product_id);
 update products set price=(select min(selling_price)');
  changed:=replace(changed,$q$'provider',p_provider,'options',n$q$,$q$'provider',p_provider,'options',n,'uploadedOnlyOptions',uploaded_kept$q$);
  if position('kept:=kept||uploaded_kept_ids' in changed)=0 or position('perform reconcile_code_inventory(p_product_id)' in changed)=0 then
   raise exception 'Unknown supplier switch implementation'; end if;
  execute changed;
 end if;
 -- Activation requires supplier links only for supplier-backed options.
 foreach fn in array array['configure_definiteplay_product(uuid,boolean,jsonb)','configure_wupex_product(uuid,boolean,text,text)','configure_fkwallet_product(uuid,boolean,text,text)'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  if position('product_uploaded_stock_options' in src)=0 then
   if fn like 'configure_definiteplay%' then
    changed:=replace(src,'o.is_active and not exists(select 1 from jsonb_array_elements(p_mappings)',
     'o.is_active and not (not o.is_custom_value and exists(select 1 from product_uploaded_stock_options u where u.option_id=o.id and u.product_id=o.product_id)) and not exists(select 1 from jsonb_array_elements(p_mappings)');
   else
    changed:=replace(src,'o.is_active and (l.option_id is null or o.is_custom_value or l.supplier_cost<=0)',
     $q$o.is_active and not (p_kind='CODE' and not o.is_custom_value and exists(select 1 from product_uploaded_stock_options u where u.option_id=o.id and u.product_id=o.product_id)) and (l.option_id is null or o.is_custom_value or l.supplier_cost<=0)$q$);
   end if;
   if changed=src then raise exception 'Unknown supplier activation guard: %',fn; end if;
   execute changed;
  end if;
 end loop;
 -- Include the local delivery selection in stale-preview detection.
 src:=pg_get_functiondef('public.product_supplier_version(uuid)'::regprocedure);
 if position('product_uploaded_stock_options' in src)=0 then
  changed:=replace(src,$q$'selection',(select selection$q$,$q$'uploaded_only',(select coalesce(jsonb_agg(u.option_id order by u.option_id),'[]') from product_uploaded_stock_options u where u.product_id=p.id),
 'selection',(select selection$q$);
  if changed=src then raise exception 'Unknown supplier version function'; end if;
  execute changed;
 end if;
end $migration$;

revoke all on function public.supplier_uploaded_options_to_keep(uuid,jsonb),public.supplier_backup_option(uuid),
 public.confirmed_supplier_quantity(uuid),public.snapshot_uploaded_supplier_backup(),public.guard_active_supplier_denomination()
 from public,anon,authenticated;
grant execute on function public.supplier_uploaded_options_to_keep(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
