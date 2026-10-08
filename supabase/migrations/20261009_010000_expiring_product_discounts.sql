begin;
-- Prices remain untouched: promotions are evaluated at order creation, without an expiry cron.
create table if not exists public.product_promotions (
 product_id uuid primary key references public.products(id) on delete cascade,
 rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules)='array' and jsonb_array_length(rules)<=201),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.product_promotions enable row level security;
revoke all on public.product_promotions from public,anon,authenticated;
grant all on public.product_promotions to service_role;
alter table public.order_items add column if not exists promotion_percent numeric(5,2) not null default 0 check(promotion_percent>=0 and promotion_percent<100);

create or replace function public.save_product_promotions(p_product uuid,p_admin uuid,p_revision uuid,p_rules jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare old_revision uuid; rule jsonb; pct numeric; expiry timestamptz; opt uuid; seen text[]:='{}'; new_revision uuid:=gen_random_uuid();
begin
 if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access is required.'; end if;
 perform 1 from products where id=p_product for update;
 if not found then raise exception 'Product not found.'; end if;
 select revision into old_revision from product_promotions where product_id=p_product;
 if old_revision is distinct from p_revision then raise exception 'Discount settings changed. Reload this product before saving.'; end if;
 if p_rules is null or jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules)>201 or pg_column_size(p_rules)>100000 then raise exception 'Invalid discount settings.'; end if;
 if jsonb_array_length(p_rules)>0 and exists(select 1 from seller_product_submissions where product_id=p_product) then
  raise exception 'Seller-managed listings do not support store sale discounts.';
 end if;
 for rule in select value from jsonb_array_elements(p_rules) loop
  if jsonb_typeof(rule)<>'object' or not(rule ? 'optionId') or coalesce(rule->>'percent','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Invalid discount.'; end if;
  opt:=nullif(rule->>'optionId','')::uuid;
  if coalesce(opt::text,'product')=any(seen) then raise exception 'Duplicate denomination discount.'; end if;
  seen:=array_append(seen,coalesce(opt::text,'product'));
  if opt is not null and not exists(select 1 from product_options where id=opt and product_id=p_product) then raise exception 'The denomination does not belong to this product.'; end if;
  pct:=(rule->>'percent')::numeric;
  if pct<0 or pct>=100 or pct<>round(pct,2) then raise exception 'Discount must be from 0 to 99.99 percent.'; end if;
  expiry:=nullif(rule->>'endsAt','')::timestamptz;
  if pct>0 and (expiry is null or not isfinite(expiry) or expiry>now()+interval '10 years') then raise exception 'Every discount needs a valid expiry date.'; end if;
 end loop;
 insert into product_promotions(product_id,rules,revision,updated_at) values(p_product,p_rules,new_revision,now())
 on conflict(product_id) do update set rules=excluded.rules,revision=excluded.revision,updated_at=excluded.updated_at;
 return new_revision;
end $$;
revoke all on function public.save_product_promotions(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_product_promotions(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.active_product_promotion(p_product uuid,p_option uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select rule from product_promotions p cross join lateral (
  select value as rule from jsonb_array_elements(p.rules)
  where value->>'optionId'=p_option::text or value->>'optionId' is null
  order by (value->>'optionId' is not null) desc limit 1
 ) selected where p.product_id=p_product;
$$;
create or replace function public.product_promotion_percent(p_product uuid,p_option uuid)
returns numeric language sql stable security definer set search_path=public as $$
 select case when (r->>'endsAt')::timestamptz>now() then coalesce((r->>'percent')::numeric,0) else 0 end
 from (select public.active_product_promotion(p_product,p_option) as r)s;
$$;
create or replace function public.promotion_unit_price(p_product uuid,p_option uuid,p_regular numeric)
returns numeric language sql stable security definer set search_path=public as $$
 select greatest(case when p_regular>0 then 0.01 else 0 end,round(p_regular*(1-public.product_promotion_percent(p_product,p_option)/100),2));
$$;
create or replace function public.extra_customer_discount(p_total numeric,p_promotion numeric,p_customer numeric)
returns numeric language sql immutable set search_path=public as $$
 select round(p_total*greatest(0,least(100,coalesce(p_customer,0))-coalesce(p_promotion,0))/(100-coalesce(p_promotion,0)),2);
$$;
revoke all on function public.active_product_promotion(uuid,uuid),public.product_promotion_percent(uuid,uuid),public.promotion_unit_price(uuid,uuid,numeric),public.extra_customer_discount(numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.active_product_promotion(uuid,uuid),public.product_promotion_percent(uuid,uuid),public.promotion_unit_price(uuid,uuid,numeric),public.extra_customer_discount(numeric,numeric,numeric) to service_role;

-- Preserve all installed stock, supplier, protected-data and business checks.
do $$
declare src text; needle text;
begin
 src:=pg_get_functiondef('public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure);
 if position('public.promotion_unit_price' in src)=0 then
  needle:='v_fulfillment_mode :=';
  if position(needle in src)=0 or position('quantity, unit_price, total_price' in src)=0 or position('v_quantity, v_unit_price, v_unit_price * v_quantity' in src)=0 then
   raise exception 'Unrecognised checkout function. Discount update was not applied.';
  end if;
  src:=replace(src,needle,$patch$v_unit_price := public.promotion_unit_price(v_product.id,v_option.id,v_unit_price);
    if v_item ? 'expectedSaleUnitPrice' and ((v_item->>'expectedSaleUnitPrice')::numeric is distinct from v_unit_price) then
      raise exception 'The price or discount changed. Refresh checkout and review the updated total.';
    end if;
    $patch$||needle);
  src:=replace(src,'quantity, unit_price, total_price','quantity, unit_price, total_price, promotion_percent');
  src:=replace(src,'v_quantity, v_unit_price, v_unit_price * v_quantity','v_quantity, v_unit_price, v_unit_price * v_quantity, public.product_promotion_percent(v_product.id,v_option.id)');
  execute src;
 end if;
 src:=pg_get_functiondef('public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)'::regprocedure);
 if position('public.extra_customer_discount' in src)=0 then
  needle:='round(i.total_price*least(100,greatest(0,coalesce(d.discount_percent,0)))/100,2)';
  if position(needle in src)=0 then raise exception 'Unrecognised business discount calculation.'; end if;
  src:=replace(src,needle,'public.extra_customer_discount(i.total_price,i.promotion_percent,d.discount_percent)');
  needle:='round(i.unit_price*(1-case when has_seller then 0 else least(100,greatest(0,coalesce(d.discount_percent,0)))/100 end),2)';
  if position(needle in src)=0 then raise exception 'Unrecognised business unit price.'; end if;
  src:=replace(src,needle,'i.unit_price-case when has_seller then 0 else public.extra_customer_discount(i.unit_price,i.promotion_percent,d.discount_percent) end');
  needle:='round(i.total_price*(case when has_seller then 0 else least(100,greatest(0,coalesce(d.discount_percent,0)))/100 end),2)';
  if position(needle in src)=0 then raise exception 'Unrecognised business line price.'; end if;
  src:=replace(src,needle,'case when has_seller then 0 else public.extra_customer_discount(i.total_price,i.promotion_percent,d.discount_percent) end');
  execute src;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
