begin;
create table if not exists public.definiteplay_ranges (
 sku text primary key check(sku ~ '^[A-Za-z0-9._-]{1,100}$'), currency text not null check(currency ~ '^[A-Z]{3}$'),
 minimum numeric(12,2) not null check(minimum>0),maximum numeric(12,2) not null check(maximum>=minimum),
 step numeric(12,2) not null check(step>0),discount numeric(12,6) not null check(discount>=-1000 and discount<100),
 available boolean not null default false,synced_at timestamptz not null default 'epoch',worker_seen_at timestamptz not null default 'epoch');
alter table public.definiteplay_ranges enable row level security;
revoke all on public.definiteplay_ranges from public,anon,authenticated;
grant select,insert,update,delete on public.definiteplay_ranges to service_role;
alter table public.definiteplay_jobs add column if not exists card_value numeric(12,2),add column if not exists card_currency text;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.definiteplay_jobs'::regclass and conname='definiteplay_job_range_pair') then
  alter table public.definiteplay_jobs add constraint definiteplay_job_range_pair check((card_value is null and card_currency is null) or
   (card_value is not null and card_currency is not null and card_value>0 and card_value::text not in ('NaN','Infinity','-Infinity') and card_currency='USD'));
 end if;
end;$$;

create or replace function public.sync_definiteplay_ranges(p_rows jsonb,p_synced_at timestamptz,p_ready boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb;low numeric;high numeric;increment numeric;percent numeric;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 or p_synced_at is null or p_synced_at>now()+interval '1 minute' then raise exception 'Invalid range catalogue';end if;
 if (select count(*) from jsonb_array_elements(p_rows))<>(select count(distinct value->>'sku') from jsonb_array_elements(p_rows)) then raise exception 'Duplicate range SKU';end if;
 update definiteplay_ranges set available=false where available=true;
 for r in select value from jsonb_array_elements(p_rows) loop
  low:=(r->>'lowerLimit')::numeric;high:=(r->>'upperLimit')::numeric;increment:=(r->>'minimumIncrement')::numeric;
  if r->>'discount' !~ '^-?[0-9]+([.][0-9]{1,6})?%$' then raise exception 'Invalid range discount';end if;
  percent:=rtrim(r->>'discount','%')::numeric;
  if low::text in ('NaN','Infinity','-Infinity') or high::text in ('NaN','Infinity','-Infinity') or increment::text in ('NaN','Infinity','-Infinity') or low<>round(low,2) or high<>round(high,2) or increment<>round(increment,2) or high>1000000 then raise exception 'Unsupported range precision';end if;
  insert into definiteplay_ranges(sku,currency,minimum,maximum,step,discount,available,synced_at,worker_seen_at)
   values(r->>'sku',r->>'cardCurrency',low,high,increment,percent,coalesce(p_ready,false),p_synced_at,now())
   on conflict(sku) do update set currency=excluded.currency,minimum=excluded.minimum,maximum=excluded.maximum,step=excluded.step,discount=excluded.discount,available=excluded.available,synced_at=excluded.synced_at,worker_seen_at=excluded.worker_seen_at;
 end loop;
end;$$;

create or replace function public.definiteplay_range_cost(p_option_id uuid,p_value numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare r public.product_range_settings%rowtype;s public.definiteplay_ranges%rowtype;
begin
 select * into r from product_range_settings where option_id=p_option_id for share;
 if not found or not r.enabled or r.delivery_mode<>'SUPPLIER' or r.supplier is distinct from 'DEFINITEPLAY' then raise exception 'Supplier range is disabled';end if;
 select * into s from definiteplay_ranges where sku=r.supplier_reference for share;
 if not found or not s.available or s.synced_at<now()-interval '15 minutes' or s.synced_at>now()+interval '1 minute' or s.worker_seen_at<now()-interval '2 minutes' then raise exception 'Supplier range is temporarily unavailable';end if;
 if s.currency<>'USD' or s.currency<>r.currency then raise exception 'Supplier billing currency requires verification';end if;
 if r.minimum<s.minimum or r.maximum>s.maximum or mod(r.minimum-s.minimum,s.step)<>0 or mod(r.step,s.step)<>0 then raise exception 'Supplier range limits changed';end if;
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<>round(p_value,2) or p_value<r.minimum or p_value>r.maximum or mod(p_value-r.minimum,r.step)<>0 then raise exception 'Invalid supplier card value';end if;
 return ceil(p_value*(1-s.discount/100)*100)/100;
end;$$;

create or replace function public.definiteplay_range_limits(p_option_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record;result jsonb:='[]'::jsonb;quantity integer;
begin
 if cardinality(p_option_ids)>100 then raise exception 'Too many options';end if;
 for r in select option_id,minimum from product_range_settings where option_id=any(p_option_ids) and delivery_mode='SUPPLIER' loop
  quantity:=0;
  begin perform definiteplay_range_cost(r.option_id,r.minimum);quantity:=1000;exception when others then quantity:=0;end;
  result:=result||jsonb_build_array(jsonb_build_object('optionId',r.option_id,'quantity',quantity));
 end loop;
 return result;
end;$$;

-- Preserve installed manual range saving and add a fail-closed activation check.
do $$declare src text;needle text;
begin
 src:=pg_get_functiondef('public.save_product_range(uuid,uuid,jsonb)'::regprocedure);
 needle:='if enabled and mode=''SUPPLIER'' then raise exception ''Supplier range activation needs a verified variable-value API connection. Save disabled until the supplier adapter is ready.''; end if;';
 if position('definiteplay_range_cost' in src)=0 then
  if position(needle in src)=0 then raise exception 'Unrecognised range save function';end if;
  src:=replace(src,needle,$patch$if mode='SUPPLIER' and (p_settings->>'supplier' is distinct from 'DEFINITEPLAY' or coalesce(p_settings->>'supplier_reference','') !~ '^[A-Za-z0-9._-]{1,100}$') then raise exception 'Import a valid supplier range';end if;$patch$);
  needle:='stock_quantity=0 where id=opt;';
  if position(needle in src)=0 then raise exception 'Unrecognised range save update';end if;
  src:=replace(src,needle,needle||$patch$
  if enabled and mode='SUPPLIER' then perform public.definiteplay_range_cost(opt,(p_settings->>'minimum')::numeric);end if;$patch$);
  execute src;
 end if;
end;$$;

create or replace function public.range_order_price(p_option_id uuid,p_value numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare r public.product_range_settings%rowtype;price numeric;cost numeric;
begin
 select * into r from product_range_settings where option_id=p_option_id for share;
 if not found or not r.enabled then raise exception 'Range purchasing is disabled.';end if;
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<>round(p_value,2) or p_value<r.minimum or p_value>r.maximum or mod(p_value-r.minimum,r.step)<>0 then raise exception 'The denomination is outside the allowed range or step.';end if;
 price:=round(p_value*r.price_usd/r.price_basis,2);
 if price<=0 then raise exception 'The denomination price must be positive.';end if;
 if r.delivery_mode='SUPPLIER' then
  cost:=definiteplay_range_cost(p_option_id,p_value);
  if cost<=0 or cost>price then raise exception 'Supplier cost exceeds the selling price';end if;
 elsif r.delivery_mode<>'MANUAL' then raise exception 'Unsupported range delivery';end if;
 return price;
end;$$;

create or replace function public.snapshot_range_order_item()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.product_range_settings%rowtype;
begin
 select * into r from product_range_settings where option_id=NEW.product_option_id for share;
 if not found then
  if NEW.fulfillment_mode in ('RANGE_MANUAL','RANGE_SUPPLIER') then raise exception 'Invalid range delivery mode';end if;
  return NEW;
 end if;
 perform range_order_price(NEW.product_option_id,NEW.custom_value);
 if r.product_id<>NEW.product_id then raise exception 'Invalid range product';end if;
 NEW.fulfillment_mode:=case when r.delivery_mode='SUPPLIER' then 'RANGE_SUPPLIER' else 'RANGE_MANUAL' end;
 NEW.denomination:=NEW.custom_value;
 NEW.option_name:='Range - '||NEW.custom_value::text||' '||r.currency;
 return NEW;
end;$$;

-- Snapshot the exact range SKU and value; never use a fixed-value SKU for a custom order.
create or replace function public.snapshot_definiteplay_order_item()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.fulfillment_mode='RANGE_MANUAL' then return NEW;end if;
 if NEW.fulfillment_mode='RANGE_SUPPLIER' then
  if NEW.quantity<1 or NEW.quantity>1000 then raise exception 'Invalid range quantity';end if;
  insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,card_value,card_currency)
   select NEW.id,NEW.order_id,'IGPDP'||replace(NEW.id::text,'-',''),r.supplier_reference,NEW.quantity,
    definiteplay_range_cost(NEW.product_option_id,NEW.custom_value),NEW.custom_value,r.currency
   from product_range_settings r where r.option_id=NEW.product_option_id and r.product_id=NEW.product_id;
  if not found then raise exception 'Supplier range mapping missing';end if;
 elsif exists(select 1 from products where id=NEW.product_id and stock_source='DEFINITEPLAY') then
  insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost)
   select NEW.id,NEW.order_id,'IGPDP'||replace(NEW.id::text,'-',''),sku,NEW.quantity,unit_cost from definiteplay_stock where option_id=NEW.product_option_id;
 end if;
 return NEW;
end;$$;

do $$declare src text;fn regprocedure;
begin
 fn:='public.guard_order_item_combined_stock()'::regprocedure;src:=pg_get_functiondef(fn);
 if position('RANGE_SUPPLIER' in src)=0 then
  src:=regexp_replace(src,'\mbegin\M',$patch$begin
  if NEW.fulfillment_mode='RANGE_SUPPLIER' then
   perform public.definiteplay_range_cost(NEW.product_option_id,NEW.custom_value);
   if NEW.quantity<1 or NEW.quantity>1000 or exists(select 1 from order_items where order_id=NEW.order_id and product_option_id=NEW.product_option_id group by product_option_id having sum(quantity)+NEW.quantity>1000) then raise exception 'Invalid combined range quantity';end if;
   return NEW;
  end if;$patch$,'i');execute src;
 end if;
 fn:='public.fulfill_instant_items(uuid)'::regprocedure;src:=pg_get_functiondef(fn);
 if position('RANGE_SUPPLIER' in src)=0 then
  if position('RANGE_MANUAL' in src)=0 then raise exception 'Install manual range support first';end if;
  src:=replace(src,'item.fulfillment_mode=''RANGE_MANUAL''','item.fulfillment_mode in (''RANGE_MANUAL'',''RANGE_SUPPLIER'')');
  src:=replace(src,'v_item.fulfillment_mode = ''RANGE_MANUAL''','v_item.fulfillment_mode in (''RANGE_MANUAL'',''RANGE_SUPPLIER'')');
  if position('RANGE_SUPPLIER' in src)=0 then raise exception 'Unrecognised instant delivery function';end if;execute src;
 end if;
 fn:='public.guard_definiteplay_item()'::regprocedure;src:=pg_get_functiondef(fn);
 if position('NEW.custom_value is distinct' in src)=0 then
  src:=replace(src,'NEW.unit_price is distinct from OLD.unit_price','NEW.custom_value is distinct from OLD.custom_value or NEW.denomination is distinct from OLD.denomination or NEW.fulfillment_mode is distinct from OLD.fulfillment_mode or NEW.unit_price is distinct from OLD.unit_price');execute src;
 end if;
end;$$;
revoke all on function public.sync_definiteplay_ranges(jsonb,timestamptz,boolean),public.definiteplay_range_cost(uuid,numeric),public.definiteplay_range_limits(uuid[]) from public,anon,authenticated;
grant execute on function public.sync_definiteplay_ranges(jsonb,timestamptz,boolean),public.definiteplay_range_cost(uuid,numeric),public.definiteplay_range_limits(uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
