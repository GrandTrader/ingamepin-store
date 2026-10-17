-- Keep supplier cost, selling price and funded availability in one transaction.
-- This does not submit purchases, publish drafts or enable automatic delivery.
begin;
alter table public.fkwallet_imports add column if not exists pricing_synced_at timestamptz not null default 'epoch';
create index if not exists fkwallet_imports_pricing_due on public.fkwallet_imports(connection_id,pricing_synced_at);

create or replace function public.guard_fkwallet_configuration() returns trigger
language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='FKWALLET' and not exists(select 1 from fkwallet_delivery_settings where product_id=NEW.id) then raise exception 'Use the FKWallet supplier tab first'; end if;
  if OLD.stock_source='FKWALLET' and NEW.stock_source not in ('FKWALLET','OWNED') then raise exception 'Disable FKWallet delivery first'; end if;
 else
  pid:=OLD.product_id;
  if exists(select 1 from products where id=pid and stock_source='FKWALLET') then
   -- Only the catalogue RPC may refresh cost metadata. Mappings and customer
   -- fields stay frozen, including while customer orders are in progress.
   if TG_OP='UPDATE' and coalesce(current_setting('app.fkwallet_catalogue_sync',true),'')=pid::text then
    if TG_TABLE_NAME='fkwallet_product_links' and
     (to_jsonb(NEW)-array['supplier_cost','supplier_snapshot'])=(to_jsonb(OLD)-array['supplier_cost','supplier_snapshot']) then return NEW; end if;
    if TG_TABLE_NAME='fkwallet_imports' and
     (to_jsonb(NEW)-'pricing_synced_at')=(to_jsonb(OLD)-'pricing_synced_at') then return NEW; end if;
   end if;
   raise exception 'Disable FKWallet delivery before changing supplier links or customer fields';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;

create or replace function public.sync_fkwallet_catalogue(p_product_id uuid,p_connection text,p_rows jsonb,p_synced_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare p products%rowtype; imp fkwallet_imports%rowtype; r record; facts jsonb;
 cost numeric; price numeric; qty integer; stock_rows jsonb:='[]'; changed integer:=0;
 previous_guard text:=coalesce(current_setting('app.fkwallet_catalogue_sync',true),'');
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 or
  p_synced_at is null or p_synced_at>clock_timestamp()+interval '1 minute' or p_synced_at<clock_timestamp()-interval '5 minutes' then raise exception 'Invalid FKWallet catalogue snapshot'; end if;
 select * into p from products where id=p_product_id for update;
 select * into imp from fkwallet_imports where product_id=p_product_id for update;
 if p.id is null or imp.product_id is null or imp.connection_id is distinct from p_connection then raise exception 'Invalid FKWallet product connection'; end if;
 -- A late request cannot overwrite a newer supplier snapshot.
 if p_synced_at<imp.pricing_synced_at then return 0; end if;
 if p.seller_id is not null or p.stock_source not in ('OWNED','FKWALLET') then
  update fkwallet_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
  return 0;
 end if;
 if imp.exchange_rate is null or imp.exchange_rate<=0 or imp.exchange_rate>100000000 or
  imp.markup_percent is null or imp.markup_percent not between 0 and 1000 then raise exception 'Invalid FKWallet pricing settings'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)x where jsonb_typeof(x)<>'object' or
   not exists(select 1 from fkwallet_product_links l where l.product_id=p_product_id and l.option_id::text=x->>'optionId' and l.connection_id=p_connection)) or
  (select count(distinct x->>'optionId') from jsonb_array_elements(p_rows)x)<>jsonb_array_length(p_rows) then raise exception 'Invalid FKWallet option mapping'; end if;
 perform set_config('app.fkwallet_catalogue_sync',p_product_id::text,true);
 for r in select l.*,o.is_active,o.is_custom_value,o.selling_price from fkwallet_product_links l
  join product_options o on o.id=l.option_id and o.product_id=l.product_id
  where l.product_id=p_product_id and l.connection_id=p_connection order by l.option_id for update of l,o
 loop
  select value into facts from jsonb_array_elements(p_rows) where value->>'optionId'=r.option_id::text;
  qty:=0;
  if facts is not null then
   if coalesce(facts->>'quantity','')!~'^[0-9]{1,4}$' or (facts->>'quantity')::integer>1000 then raise exception 'Invalid FKWallet quantity'; end if;
   qty:=(facts->>'quantity')::integer;
   if facts ? 'supplierCost' then
    if facts->>'supplierId' is distinct from r.supplier_product_id::text or facts->>'supplierCurrency' is distinct from r.supplier_currency or
     coalesce(facts->>'supplierCost','')!~'^[0-9]{1,9}([.][0-9]{1,8})?$' or r.is_custom_value then raise exception 'Invalid FKWallet supplier price'; end if;
    cost:=(facts->>'supplierCost')::numeric;
    if cost<=0 or cost>100000000 then raise exception 'Invalid FKWallet supplier price'; end if;
    -- Numeric arithmetic matches fkSellingPrice: round half up once, in USD.
    price:=round(cost/imp.exchange_rate*(1+imp.markup_percent/100),2);
    if price<0.01 or price>9999999.99 then raise exception 'Invalid FKWallet selling price'; end if;
    update fkwallet_product_links set supplier_cost=cost,supplier_snapshot=jsonb_set(supplier_snapshot,'{price}',to_jsonb(cost),true)
     where option_id=r.option_id and supplier_cost is distinct from cost;
    update product_options set selling_price=price,updated_at=now() where id=r.option_id and selling_price is distinct from price;
    if p.stock_source='FKWALLET' then
     update definiteplay_stock set unit_cost=ceil(cost/imp.exchange_rate*100000000)/100000000
      where option_id=r.option_id and product_id=p_product_id and sku='FK'||r.supplier_product_id and currency='USD';
     if not found then raise exception 'FKWallet delivery cost link is missing'; end if;
    end if;
    if r.supplier_cost is distinct from cost or r.selling_price is distinct from price then changed:=changed+1; end if;
   elsif qty<>0 then raise exception 'FKWallet availability requires a valid supplier price';
   end if;
  end if;
  stock_rows:=stock_rows||jsonb_build_array(jsonb_build_object('optionId',r.option_id,'quantity',case when r.is_active and not r.is_custom_value then qty else 0 end));
 end loop;
 -- The existing function never changes stock for drafts/manual products.
 if p.stock_source='FKWALLET' then perform sync_fkwallet_stock(p_product_id,p_connection,stock_rows); end if;
 update fkwallet_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
 perform set_config('app.fkwallet_catalogue_sync',previous_guard,true);
 return changed;
end $$;
revoke all on function public.sync_fkwallet_catalogue(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_fkwallet_catalogue(uuid,text,jsonb,timestamptz) to service_role;
-- Hold the selected cost link while a new website order snapshots its budget.
-- An overlapping catalogue refresh can then supply either the old complete
-- snapshot or the new complete snapshot, never mixed cost/currency metadata.
do $$ declare source text; needle text := 'select * into link from fkwallet_product_links where option_id=NEW.product_option_id and product_id=NEW.product_id and connection_id=imp.connection_id;'; begin
 source:=pg_get_functiondef('public.snapshot_fkwallet_order_item()'::regprocedure);
 if position(needle in source)>0 then
  execute replace(source,needle,replace(needle,';',' for share;'));
 elsif position(replace(needle,';',' for share;') in source)=0 then
  raise exception 'Unrecognised FKWallet order snapshot function';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
