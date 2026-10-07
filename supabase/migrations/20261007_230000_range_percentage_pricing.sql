begin;
-- Supplier markup and cost snapshots remain private; public data exposes only the selling rate.
alter table public.product_range_settings
 alter column price_usd type numeric(24,10),
 add column if not exists supplier_markup_percent numeric(7,2) check(supplier_markup_percent>=0 and supplier_markup_percent<=1000),
 add column if not exists supplier_discount_percent numeric(12,6) check(supplier_discount_percent>=-1000 and supplier_discount_percent<100),
 add column if not exists price_rounding text not null default 'NEAREST' check(price_rounding in ('NEAREST','UP'));

-- Legacy/manual saves remove any previous percentage configuration.
do $$declare src text;needle text;
begin
 src:=pg_get_functiondef('public.save_product_range(uuid,uuid,jsonb)'::regprocedure);
 if position('supplier_markup_percent=null' in src)=0 then
  needle:='stock_quantity=0 where id=opt;';
  if position(needle in src)=0 then raise exception 'Unrecognised range save function';end if;
  src:=replace(src,needle,needle||$patch$
  update product_range_settings set supplier_markup_percent=null,supplier_discount_percent=null,price_rounding='NEAREST' where product_id=p_product_id;$patch$);
  execute src;
 end if;
end;$$;

create or replace function public.save_supplier_range_percentage(p_product_id uuid,p_admin_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare markup numeric;discount numeric;rate numeric;settings jsonb;active boolean;s definiteplay_ranges%rowtype;
begin
 if not exists(select 1 from admin_users where user_id=p_admin_id) then raise exception 'Administrator access is required.';end if;
 if p_settings->>'delivery_mode' is distinct from 'SUPPLIER' or p_settings->>'supplier' is distinct from 'DEFINITEPLAY' or p_settings->>'currency' is distinct from 'USD' then raise exception 'Supplier percentage pricing requires verified USD billing';end if;
 if coalesce(p_settings->>'markup_percent','') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(p_settings->>'supplier_discount_percent','') !~ '^-?[0-9]+([.][0-9]{1,6})?$' then raise exception 'Invalid markup or supplier discount';end if;
 markup:=(p_settings->>'markup_percent')::numeric;discount:=(p_settings->>'supplier_discount_percent')::numeric;
 if markup<0 or markup>1000 or discount < -1000 or discount>=100 then raise exception 'Invalid markup or supplier discount';end if;
 active:=coalesce((p_settings->>'enabled')::boolean,false);
 if active then
  select * into s from definiteplay_ranges where sku=p_settings->>'supplier_reference' for share;
  if not found or s.discount<>discount then raise exception 'Supplier pricing changed. Reload the range before saving.';end if;
 end if;
 rate:=(100-discount)*(1+markup/100);
 settings:=p_settings||jsonb_build_object('price_basis',100,'price_usd',rate);
 perform save_product_range(p_product_id,p_admin_id,settings);
 update product_range_settings set supplier_markup_percent=markup,supplier_discount_percent=discount,price_rounding='UP' where product_id=p_product_id;
end;$$;
revoke all on function public.save_supplier_range_percentage(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_supplier_range_percentage(uuid,uuid,jsonb) to service_role;

-- Keep the chosen percentage when the supplier publishes a new cost. Paid jobs remain immutable.
do $$declare src text;needle text;
begin
 src:=pg_get_functiondef('public.sync_definiteplay_ranges(jsonb,timestamptz,boolean)'::regprocedure);
 if position('supplier_markup_percent' in src)=0 then
  needle:='end loop;';
  if position(needle in src)=0 then raise exception 'Unrecognised supplier catalogue sync function';end if;
  src:=replace(src,needle,needle||$patch$
  if p_synced_at>=now()-interval '15 minutes' then
   update product_range_settings r set price_basis=100,
    price_usd=(100-s.discount)*(1+r.supplier_markup_percent/100),supplier_discount_percent=s.discount,updated_at=now()
   from definiteplay_ranges s where r.supplier_reference=s.sku and r.supplier='DEFINITEPLAY' and r.delivery_mode='SUPPLIER'
    and r.currency='USD' and s.currency='USD' and r.supplier_markup_percent is not null and s.synced_at=p_synced_at
    and (r.supplier_discount_percent is distinct from s.discount);
   update product_options o set selling_price=r.price_usd,denomination=r.price_basis
    from product_range_settings r where o.id=r.option_id and r.supplier_markup_percent is not null
     and (o.selling_price is distinct from round(r.price_usd,2) or o.denomination is distinct from r.price_basis);
  end if;$patch$);
  execute src;
 end if;
 src:=pg_get_functiondef('public.range_order_price(uuid,numeric)'::regprocedure);
 if position('price_rounding' in src)=0 then
  needle:='price:=round(p_value*r.price_usd/r.price_basis,2);';
  if position(needle in src)=0 then raise exception 'Unrecognised range price function';end if;
  src:=replace(src,needle,$patch$price:=case when r.price_rounding='UP' then ceil(p_value*r.price_usd/r.price_basis*100)/100 else round(p_value*r.price_usd/r.price_basis,2) end;$patch$);
  execute src;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
