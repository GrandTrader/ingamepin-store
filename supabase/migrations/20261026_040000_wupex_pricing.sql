-- Keep supplier cost, selling price and funded availability in one transaction.
-- This does not submit purchases, publish drafts or enable automatic delivery.
begin;
alter table public.wupex_imports add column if not exists pricing_synced_at timestamptz not null default 'epoch';
create index if not exists wupex_imports_pricing_due on public.wupex_imports(connection_id,pricing_synced_at);

create or replace function public.guard_wupex_configuration() returns trigger
language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='WUPEX' and not exists(select 1 from wupex_delivery_settings where product_id=NEW.id) then raise exception 'Use the Wupex supplier tab first'; end if;
  if OLD.stock_source='WUPEX' and NEW.stock_source not in ('WUPEX','OWNED') then raise exception 'Disable Wupex delivery first'; end if;
 else
  pid:=case when TG_OP='INSERT' then NEW.product_id else OLD.product_id end;
  if exists(select 1 from products where id=pid and stock_source='WUPEX') then
   -- Only the catalogue RPC may refresh cost metadata. Mappings and customer
   -- fields stay frozen, including while customer orders are in progress.
   if TG_OP='UPDATE' and TG_TABLE_NAME='wupex_imports' and coalesce(current_setting('app.wupex_markup',true),'')=pid::text and (to_jsonb(NEW)-'markup_percent')=(to_jsonb(OLD)-'markup_percent') then return NEW; end if;
   if TG_OP='UPDATE' and coalesce(current_setting('app.wupex_catalogue_sync',true),'')=pid::text then
    if TG_TABLE_NAME='wupex_product_links' and
     (to_jsonb(NEW)-array['supplier_cost','supplier_snapshot'])=(to_jsonb(OLD)-array['supplier_cost','supplier_snapshot']) then return NEW; end if;
    if TG_TABLE_NAME='wupex_imports' and
     (to_jsonb(NEW)-'pricing_synced_at')=(to_jsonb(OLD)-'pricing_synced_at') then return NEW; end if;
   end if;
   raise exception 'Disable Wupex delivery before changing supplier links or customer fields';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;

create or replace function public.sync_wupex_catalogue(p_product_id uuid,p_connection text,p_rows jsonb,p_synced_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare p products%rowtype; imp wupex_imports%rowtype; r record; facts jsonb;
 cost numeric; price numeric; qty integer; stock_rows jsonb:='[]'; changed integer:=0;
 previous_guard text:=coalesce(current_setting('app.wupex_catalogue_sync',true),'');
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 or
  p_synced_at is null or p_synced_at>clock_timestamp()+interval '1 minute' or p_synced_at<clock_timestamp()-interval '5 minutes' then raise exception 'Invalid Wupex catalogue snapshot'; end if;
 select * into p from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id for update;
 if p.id is null or imp.product_id is null or imp.connection_id is distinct from p_connection then raise exception 'Invalid Wupex product connection'; end if;
 -- A late request cannot overwrite a newer supplier snapshot.
 if p_synced_at<imp.pricing_synced_at then return 0; end if;
 if p.seller_id is not null or p.stock_source not in ('OWNED','WUPEX') then
  update wupex_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
  return 0;
 end if;
 if imp.exchange_rate is null or imp.exchange_rate<=0 or imp.exchange_rate>100000000 or
  imp.markup_percent is null or imp.markup_percent not between 0 and 1000 then raise exception 'Invalid Wupex pricing settings'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)x where jsonb_typeof(x)<>'object' or
   not exists(select 1 from wupex_product_links l where l.product_id=p_product_id and l.option_id::text=x->>'optionId' and l.connection_id=p_connection)) or
  (select count(distinct x->>'optionId') from jsonb_array_elements(p_rows)x)<>jsonb_array_length(p_rows) then raise exception 'Invalid Wupex option mapping'; end if;
 perform set_config('app.wupex_catalogue_sync',p_product_id::text,true);
 for r in select l.*,o.is_active,o.is_custom_value,o.selling_price from wupex_product_links l
  join product_options o on o.id=l.option_id and o.product_id=l.product_id
  where l.product_id=p_product_id and l.connection_id=p_connection order by l.option_id for update of l,o
 loop
  select value into facts from jsonb_array_elements(p_rows) where value->>'optionId'=r.option_id::text;
  qty:=0;
  if facts is not null then
   if coalesce(facts->>'quantity','')!~'^[0-9]{1,4}$' or (facts->>'quantity')::integer>1000 then raise exception 'Invalid Wupex quantity'; end if;
   qty:=(facts->>'quantity')::integer;
   if facts ? 'supplierCost' then
    if facts->>'supplierId' is distinct from r.supplier_product_id::text or facts->>'supplierCurrency' is distinct from r.supplier_currency or
     coalesce(facts->>'supplierCost','')!~'^[0-9]{1,9}([.][0-9]{1,8})?$' or r.is_custom_value then raise exception 'Invalid Wupex supplier price'; end if;
    cost:=(facts->>'supplierCost')::numeric;
    if cost<=0 or cost>100000000 then raise exception 'Invalid Wupex supplier price'; end if;
    -- Numeric arithmetic matches fkSellingPrice: round half up once, in USD.
    price:=round(cost/imp.exchange_rate*(1+imp.markup_percent/100),2);
    if price<0.01 or price>9999999.99 then raise exception 'Invalid Wupex selling price'; end if;
    update wupex_product_links set supplier_cost=cost,supplier_snapshot=jsonb_set(supplier_snapshot,'{price}',to_jsonb(cost),true)
     where option_id=r.option_id and supplier_cost is distinct from cost;
    update product_options set selling_price=price,updated_at=now() where id=r.option_id and selling_price is distinct from price;
    if p.stock_source='WUPEX' then
     update definiteplay_stock set unit_cost=ceil(cost/imp.exchange_rate*100000000)/100000000
      where option_id=r.option_id and product_id=p_product_id and sku='WX'||r.supplier_product_id and currency='USD';
     if not found then raise exception 'Wupex delivery cost link is missing'; end if;
    end if;
    if r.supplier_cost is distinct from cost or r.selling_price is distinct from price then changed:=changed+1; end if;
   elsif qty<>0 then raise exception 'Wupex availability requires a valid supplier price';
   end if;
  end if;
  stock_rows:=stock_rows||jsonb_build_array(jsonb_build_object('optionId',r.option_id,'quantity',case when r.is_active and not r.is_custom_value then qty else 0 end));
 end loop;
 -- The existing function never changes stock for drafts/manual products.
 if p.stock_source='WUPEX' then perform sync_wupex_stock(p_product_id,p_connection,stock_rows); end if;
 update wupex_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
 update products set price=(select min(selling_price) from product_options where product_id=p_product_id and is_active),updated_at=now() where id=p_product_id;
 perform set_config('app.wupex_catalogue_sync',previous_guard,true);
 return changed;
end $$;
revoke all on function public.sync_wupex_catalogue(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_wupex_catalogue(uuid,text,jsonb,timestamptz) to service_role;
-- Hold the selected cost link while a new website order snapshots its budget.
-- An overlapping catalogue refresh can then supply either the old complete
-- snapshot or the new complete snapshot, never mixed cost/currency metadata.
do $$ declare source text; needle text := 'select * into link from wupex_product_links where option_id=NEW.product_option_id and product_id=NEW.product_id and connection_id=imp.connection_id;'; begin
 source:=pg_get_functiondef('public.snapshot_wupex_order_item()'::regprocedure);
 if position(needle in source)>0 then
  execute replace(source,needle,replace(needle,';',' for share;'));
 elsif position(replace(needle,';',' for share;') in source)=0 then
  raise exception 'Unrecognised Wupex order snapshot function';
 end if;
end $$;

-- Changing markup updates all saved prices atomically, without altering old orders.
create function set_wupex_markup(p_product_id uuid,p_connection text,p_markup numeric)
returns void language plpgsql security definer set search_path=public as $$
declare imp wupex_imports%rowtype; saved_guard text:=coalesce(current_setting('app.wupex_markup',true),''); begin
 if p_markup is null or p_markup::text in ('NaN','Infinity','-Infinity') or p_markup not between 0 and 1000 or round(p_markup,2)<>p_markup then raise exception 'Invalid markup'; end if;
 perform 1 from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id and connection_id=p_connection for update;
 if not found then raise exception 'Invalid Wupex connection'; end if;
 perform set_config('app.wupex_markup',p_product_id::text,true);
 update wupex_imports set markup_percent=p_markup where product_id=p_product_id;
 if exists(select 1 from wupex_product_links where product_id=p_product_id and round(supplier_cost/imp.exchange_rate*(1+p_markup/100),2) not between 0.01 and 9999999.99) then raise exception 'Invalid selling price'; end if;
 update product_options o set selling_price=round(l.supplier_cost/imp.exchange_rate*(1+p_markup/100),2),updated_at=now() from wupex_product_links l where l.product_id=p_product_id and l.option_id=o.id and o.product_id=p_product_id;
 update products set price=(select min(selling_price) from product_options where product_id=p_product_id and is_active),updated_at=now() where id=p_product_id;
 perform set_config('app.wupex_markup',saved_guard,true);
end $$;
revoke all on function set_wupex_markup(uuid,text,numeric) from public,anon,authenticated;
grant execute on function set_wupex_markup(uuid,text,numeric) to service_role;
notify pgrst,'reload schema';
commit;
