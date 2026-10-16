begin;

alter table public.product_range_settings
 add column if not exists link_fixed_prices boolean not null default false,
 add column if not exists manual_base_price_usd numeric(24,10) check(manual_base_price_usd>0 and manual_base_price_usd<=1000000),
 add column if not exists manual_markup_percent numeric(7,2) check(manual_markup_percent>=0 and manual_markup_percent<=1000);

-- Enforce the shared rule on every write, including CSV imports, old editor tabs,
-- newly added denominations and supplier refreshes. Delivery and stock are separate.
create or replace function public.enforce_linked_range_price()
returns trigger language plpgsql security definer set search_path=public as $$
declare r product_range_settings%rowtype; s definiteplay_stock%rowtype; amount numeric; source text;
begin
 if new.is_custom_value or not new.is_active then return new;end if;
 select * into r from product_range_settings where product_id=new.product_id and link_fixed_prices;
 if not found then return new;end if;
 if new.denomination_currency is distinct from r.currency or new.denomination is null or new.denomination<=0 or new.denomination::text in ('NaN','Infinity','-Infinity') then
  raise exception 'Every active denomination must use the linked range currency and a positive card value.';
 end if;
 select stock_source into source from products where id=new.product_id;
 if r.delivery_mode='SUPPLIER' and r.supplier_markup_percent is not null and source='DEFINITEPLAY' then
  select * into s from definiteplay_stock where option_id=new.id and product_id=new.product_id;
  if not found or s.currency<>'USD' or s.unit_cost<=0 or s.synced_at<now()-interval '15 minutes' or s.synced_at>now()+interval '1 minute' then
   -- Missing costs make stock unavailable in the supplier worker. Keep the last
   -- price until a verified cost returns; never guess a supplier's fixed-item cost.
   if tg_op='UPDATE' then new.selling_price:=old.selling_price;end if;
   return new;
  end if;
  amount:=ceil(s.unit_cost*(1+r.supplier_markup_percent/100)*100)/100;
 else
  amount:=ceil(new.denomination*r.price_usd/r.price_basis*100)/100;
 end if;
 if amount<=0 or amount>9999999999.99 then raise exception 'Selling price is outside the supported range.';end if;
 new.selling_price:=amount;
 return new;
end;$$;
revoke all on function public.enforce_linked_range_price() from public,anon,authenticated;
drop trigger if exists b_enforce_linked_range_price on public.product_options;
create trigger b_enforce_linked_range_price before insert or update of selling_price,denomination,denomination_currency,is_active on public.product_options
 for each row execute function public.enforce_linked_range_price();

create or replace function public.refresh_linked_range_prices()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.link_fixed_prices then
  update product_options set selling_price=selling_price,updated_at=now()
   where product_id=new.product_id and not is_custom_value and is_active;
 end if;
 return new;
end;$$;
revoke all on function public.refresh_linked_range_prices() from public,anon,authenticated;
drop trigger if exists refresh_linked_range_prices on public.product_range_settings;
create trigger refresh_linked_range_prices after insert or update of link_fixed_prices,price_usd,price_basis,currency,supplier_markup_percent on public.product_range_settings
 for each row execute function public.refresh_linked_range_prices();

-- Linked products must not regain an independent, rounded per-option markup.
do $$declare src text;needle text;
begin
 src:=pg_get_functiondef('public.capture_definiteplay_price_edit()'::regprocedure);
 if position('link_fixed_prices' in src)=0 then
  needle:='if new.selling_price is not distinct from old.selling_price';
  if position(needle in src)=0 then raise exception 'Unrecognised supplier price edit function';end if;
  src:=replace(src,needle,$patch$if exists(select 1 from product_range_settings where product_id=new.product_id and link_fixed_prices) then return new;end if;
 if new.selling_price is not distinct from old.selling_price$patch$);
  execute src;
 end if;
 src:=pg_get_functiondef('public.sync_definiteplay_stock(jsonb,timestamptz)'::regprocedure);
 if position('link_fixed_prices' in src)=0 then
  needle:='if v_cost>0 then';
  if position(needle in src)=0 then raise exception 'Unrecognised supplier stock sync function';end if;
  src:=replace(src,needle,'if v_cost>0 and not exists(select 1 from product_range_settings where product_id=o.product_id and link_fixed_prices) then');
  execute src;
 end if;
end;$$;

create or replace function public.save_linked_product_range(p_product_id uuid,p_admin_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare markup numeric;base numeric;settings jsonb;r product_range_settings%rowtype;
begin
 if not exists(select 1 from admin_users where user_id=p_admin_id) then raise exception 'Administrator access is required.';end if;
 perform 1 from products where id=p_product_id for update;
 if not found then raise exception 'Product not found.';end if;
 perform 1 from product_options where product_id=p_product_id order by id for update;
 select * into r from product_range_settings where product_id=p_product_id for update;
 if coalesce(p_settings->>'markup_percent','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Enter a markup from 0 to 1000 percent.';end if;
 markup:=(p_settings->>'markup_percent')::numeric;
 if markup<0 or markup>1000 then raise exception 'Enter a markup from 0 to 1000 percent.';end if;
 if exists(select 1 from product_options where product_id=p_product_id and is_active and not is_custom_value
  and (denomination_currency is distinct from p_settings->>'currency' or denomination is null or denomination<=0)) then
  raise exception 'Every active denomination must use the linked range currency and a positive card value.';
 end if;
 -- Keep the intermediate legacy saves inside this transaction. A failed update
 -- rolls back both the range and every fixed price, including the previous link.
 update product_range_settings set link_fixed_prices=false where product_id=p_product_id;
 if p_settings->>'delivery_mode'='SUPPLIER' then
  perform save_supplier_range_percentage(p_product_id,p_admin_id,p_settings);
  update product_range_settings set manual_base_price_usd=null,manual_markup_percent=null,link_fixed_prices=true where product_id=p_product_id;
 elsif p_settings->>'delivery_mode'='MANUAL' then
  if coalesce(p_settings->>'base_price_usd','') !~ '^[0-9]+([.][0-9]{1,10})?$' then raise exception 'Enter a positive base price.';end if;
  base:=(p_settings->>'base_price_usd')::numeric;
  if base<=0 or base>1000000 or base*(1+markup/100)>1000000 then raise exception 'Enter a valid base price.';end if;
  settings:=p_settings||jsonb_build_object('price_usd',base*(1+markup/100));
  perform save_product_range(p_product_id,p_admin_id,settings);
  update product_range_settings set manual_base_price_usd=base,manual_markup_percent=markup,price_rounding='UP',link_fixed_prices=true where product_id=p_product_id;
 else raise exception 'Choose a delivery method.';
 end if;
end;$$;
revoke all on function public.save_linked_product_range(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_linked_product_range(uuid,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
