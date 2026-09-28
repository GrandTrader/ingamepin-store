begin;
create table if not exists public.product_range_settings (
 product_id uuid primary key references public.products(id) on delete cascade,
 option_id uuid not null unique references public.product_options(id),
 enabled boolean not null default false,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 minimum numeric(12,2) not null check(minimum>0), maximum numeric(12,2) not null check(maximum>=minimum),
 step numeric(12,2) not null default 1 check(step>0),
 price_basis integer not null check(price_basis>0), price_usd numeric(12,2) not null check(price_usd>0),
 delivery_mode text not null check(delivery_mode in ('MANUAL','SUPPLIER')),
 supplier text, supplier_reference text, updated_at timestamptz not null default now()
);
alter table public.product_range_settings enable row level security;
revoke all on public.product_range_settings from anon,authenticated;
grant all on public.product_range_settings to service_role;

create or replace function public.save_product_range(p_product_id uuid,p_admin_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare opt uuid; p public.products%rowtype; enabled boolean; mode text;
begin
 if not exists(select 1 from admin_users where user_id=p_admin_id) then raise exception 'Administrator access is required.'; end if;
 select * into p from products where id=p_product_id for update;
 if not found then raise exception 'Product not found.'; end if;
 enabled:=coalesce((p_settings->>'enabled')::boolean,false); mode:=p_settings->>'delivery_mode';
 if enabled and mode='SUPPLIER' then raise exception 'Supplier range activation needs a verified variable-value API connection. Save disabled until the supplier adapter is ready.'; end if;
 if (p_settings->>'minimum')::numeric>1000000 or (p_settings->>'maximum')::numeric>1000000 or (p_settings->>'step')::numeric>1000000 or (p_settings->>'price_basis')::numeric>1000000 or (p_settings->>'price_usd')::numeric>1000000 then raise exception 'Range amounts are too large.'; end if;
 select option_id into opt from product_range_settings where product_id=p_product_id;
 if opt is null then
   opt:=gen_random_uuid();
   insert into product_options(id,product_id,category_id,option_name,option_type,is_custom_value,is_active,is_in_stock,stock_quantity,selling_price,denomination,denomination_currency,sort_order)
    values(opt,p_product_id,p.category_id,'Range denomination','RANGE',true,false,true,0,0,1,p_settings->>'currency',999);
 end if;
 insert into product_range_settings(product_id,option_id,enabled,currency,minimum,maximum,step,price_basis,price_usd,delivery_mode,supplier,supplier_reference)
 values(p_product_id,opt,enabled,p_settings->>'currency',(p_settings->>'minimum')::numeric,(p_settings->>'maximum')::numeric,(p_settings->>'step')::numeric,(p_settings->>'price_basis')::integer,(p_settings->>'price_usd')::numeric,mode,nullif(p_settings->>'supplier',''),nullif(p_settings->>'supplier_reference',''))
 on conflict(product_id) do update set enabled=excluded.enabled,currency=excluded.currency,minimum=excluded.minimum,maximum=excluded.maximum,step=excluded.step,price_basis=excluded.price_basis,price_usd=excluded.price_usd,delivery_mode=excluded.delivery_mode,supplier=excluded.supplier,supplier_reference=excluded.supplier_reference,updated_at=now();
 update product_options set is_active=enabled,denomination_currency=p_settings->>'currency',denomination=(p_settings->>'price_basis')::integer,selling_price=(p_settings->>'price_usd')::numeric,stock_quantity=0 where id=opt;
end;$$;
revoke all on function public.save_product_range(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_product_range(uuid,uuid,jsonb) to service_role;

create or replace function public.range_order_price(p_option_id uuid,p_value numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare r public.product_range_settings%rowtype; price numeric;
begin
 select * into r from product_range_settings where option_id=p_option_id for share;
 if not found or not r.enabled then raise exception 'Range purchasing is disabled.'; end if;
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<>round(p_value,2) or p_value<r.minimum or p_value>r.maximum or mod(p_value-r.minimum,r.step)<>0 then raise exception 'The denomination is outside the allowed range or step.'; end if;
 if r.delivery_mode<>'MANUAL' then raise exception 'Supplier range delivery is not connected.'; end if;
 price:=round(p_value*r.price_usd/r.price_basis,2);
 if price<=0 then raise exception 'The denomination price must be positive.'; end if;
 return price;
end;$$;
revoke all on function public.range_order_price(uuid,numeric) from public,anon,authenticated;
grant execute on function public.range_order_price(uuid,numeric) to service_role;

-- Retain installed checkout customisations (order numbering, KYB and commissions).
do $$
declare fn regprocedure:='public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure; src text; needle text;
begin
 src:=pg_get_functiondef(fn);
 needle:='if v_custom_value is not null then';
 if position('public.range_order_price' in src)=0 then
  if position(needle in src)=0 then raise exception 'Unrecognised checkout custom-value validation; range update not applied.'; end if;
  src:=replace(src,needle,$patch$if v_option.option_type = 'RANGE' then
      v_unit_price := public.range_order_price(v_option.id, nullif(v_item ->> 'customValue','')::numeric);
    elsif v_custom_value is not null then$patch$);
  src:=replace(src,'if v_option.stock_quantity < v_quantity then','if v_option.option_type <> ''RANGE'' and v_option.stock_quantity < v_quantity then');
  execute src;
 end if;
end;$$;

create or replace function public.snapshot_range_order_item()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.product_range_settings%rowtype;
begin
 select * into r from product_range_settings where option_id=NEW.product_option_id for share;
 if not found then
  if NEW.fulfillment_mode='RANGE_MANUAL' then raise exception 'Invalid range delivery mode.'; end if;
  return NEW;
 end if;
 perform public.range_order_price(NEW.product_option_id,NEW.custom_value);
 if r.product_id<>NEW.product_id then raise exception 'Invalid range product.'; end if;
 NEW.fulfillment_mode:='RANGE_MANUAL';
 NEW.denomination:=case when NEW.custom_value=trunc(NEW.custom_value) then NEW.custom_value else null end;
 NEW.option_name:='Range - '||NEW.custom_value::text||' '||r.currency;
 return NEW;
end;$$;
drop trigger if exists a_range_snapshot on public.order_items;
create trigger a_range_snapshot before insert on public.order_items for each row execute function public.snapshot_range_order_item();

-- Range items are made to order and do not reserve a fixed-denomination code.
do $$
declare src text; fn regprocedure;
begin
 fn:='public.guard_order_item_combined_stock()'::regprocedure; src:=pg_get_functiondef(fn);
 if position('RANGE_MANUAL' in src)=0 then
  if position('begin' in src)=0 then raise exception 'Unrecognised stock guard.'; end if;
  src:=regexp_replace(src,'\mbegin\M',$patch$begin
  if NEW.fulfillment_mode='RANGE_MANUAL' and exists(select 1 from product_range_settings where option_id=NEW.product_option_id and product_id=NEW.product_id and enabled and delivery_mode='MANUAL') then return NEW; end if;$patch$,'i');execute src;
 end if;
 fn:='public.snapshot_definiteplay_order_item()'::regprocedure;src:=pg_get_functiondef(fn);
 if position('RANGE_MANUAL' in src)=0 then
  src:=regexp_replace(src,'\mbegin\M',$patch$begin
  if NEW.fulfillment_mode='RANGE_MANUAL' then return NEW; end if;$patch$,'i');execute src;
 end if;
 fn:='public.fulfill_instant_items(uuid)'::regprocedure;src:=pg_get_functiondef(fn);
 if position('RANGE_MANUAL' in src)=0 then
  if position('delivery_type = ''MANUAL''' in src)=0 then raise exception 'Unrecognised instant fulfillment function.'; end if;
  src:=replace(src,'delivery_type = ''MANUAL''','(delivery_type = ''MANUAL'' or v_item.fulfillment_mode = ''RANGE_MANUAL'')');execute src;
 end if;
 fn:='public.deliver_manual_codes_batch(uuid,uuid,uuid,text[])'::regprocedure;src:=pg_get_functiondef(fn);
 if position('RANGE_MANUAL' in src)=0 then
  if position('p.delivery_type=''MANUAL''' in src)=0 then raise exception 'Unrecognised manual delivery function.'; end if;
  src:=replace(src,'p.delivery_type=''MANUAL''','(p.delivery_type=''MANUAL'' or oi.fulfillment_mode=''RANGE_MANUAL'')');execute src;
 end if;
end;$$;
commit;
