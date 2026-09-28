begin;
-- One committed portal confirmation per customer/request key. Quotes leave no orders or reservations.
create table if not exists public.portal_wallet_orders (
 user_id uuid not null references auth.users(id), request_id uuid not null,
 payload jsonb not null, expected_total numeric not null,
 order_id uuid not null unique references public.orders(id), result jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.portal_wallet_orders enable row level security;
revoke all on public.portal_wallet_orders from public,anon,authenticated;
grant all on public.portal_wallet_orders to service_role;

create or replace function public.next_portal_order_number() returns text
language plpgsql security definer set search_path=public as $$
declare candidate text;
begin
 perform pg_advisory_xact_lock(hashtext('next_portal_order_number'));
 for attempt in 1..1000 loop
  candidate:='IPB2B'||to_char(clock_timestamp() at time zone 'Asia/Kolkata','YYYYMMDD')||(floor(random()*900000)+100000)::bigint::text;
  if not exists(select 1 from orders where order_number=candidate) then return candidate; end if;
 end loop;
 raise exception 'Unable to allocate a B2B order number. Please try again.';
end $$;
revoke all on function public.next_portal_order_number() from public,anon,authenticated;

create or replace function public.portal_wallet_checkout(p_user uuid,p_request uuid,p_action text,p_items jsonb,p_reference text,p_expected numeric,p_ip text)
returns jsonb language plpgsql security definer set search_path=public as $$
<<portal_prices>>
declare
 actor auth.users%rowtype; previous portal_wallet_orders%rowtype; payload jsonb;
 made jsonb; result jsonb; paid jsonb; oid uuid; has_seller boolean;
 balance_before numeric; wallet_currency text; subtotal numeric; discount numeric:=0; fee numeric:=0; total numeric;
 rates jsonb; rate_value numeric:=0; rate_type text; lines jsonb;
begin
 if p_action is null or p_action not in ('quote','confirm','recover') or p_user is null or p_request is null then raise exception 'Invalid portal request.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or pg_column_size(p_items)>150000 then raise exception 'Use between 1 and 100 order lines.'; end if;
 if length(coalesce(p_reference,''))>160 then raise exception 'Order reference must be at most 160 characters.'; end if;
 select * into actor from auth.users where id=p_user;
 if not found or actor.email_confirmed_at is null then raise exception 'Sign in with a verified email.'; end if;
 payload:=jsonb_build_object('items',p_items,'reference',coalesce(p_reference,''));
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_request::text,0));
 select * into previous from portal_wallet_orders where user_id=p_user and request_id=p_request;
 if found then
  if previous.payload<>payload or previous.expected_total is distinct from p_expected then raise exception 'This confirmation belongs to a different order. Check order history.'; end if;
  return previous.result||jsonb_build_object('replayed',true);
 end if;
 if p_action='recover' then return null; end if;
 perform require_approved_business(p_user);
 if actor.raw_app_meta_data->>'wallet_disabled'='true' then raise exception 'Your wallet is disabled. Contact support.'; end if;
 select balance,currency into balance_before,wallet_currency from customer_wallets where user_id=p_user for update;
 balance_before:=coalesce(balance_before,0);
 if wallet_currency is not null and wallet_currency<>'USD' then raise exception 'Only USD wallets are supported.'; end if;
 begin
  -- The same installed checkout functions validate products, quantities, required details, range amounts and seller reservations.
  select exists(select 1 from seller_product_submissions s join product_options o on o.product_id=s.product_id
    where o.id in(select (x->>'productOptionId')::uuid from jsonb_array_elements(p_items)x)) into has_seller;
  if has_seller then
   made:=create_business_checked_seller_order(coalesce(nullif(actor.raw_user_meta_data->>'name',''),split_part(actor.email,'@',1)),actor.email,'wallet',p_items,nullif(p_reference,''),p_user,p_ip);
  else
   made:=create_business_checked_order(coalesce(nullif(actor.raw_user_meta_data->>'name',''),split_part(actor.email,'@',1)),actor.email,'','wallet',p_items,nullif(p_reference,''),p_user);
  end if;
  oid:=(made->>'id')::uuid;
  update orders set customer_id=p_user,customer_ip=p_ip where id=oid;
  if exists(select 1 from order_items i join products p on p.id=i.product_id where i.order_id=oid and p.allowed_payment_methods is not null and not ('WALLET'=any(p.allowed_payment_methods))) then raise exception 'Wallet payment is unavailable for a selected product.'; end if;
  if not has_seller then
   select coalesce(sum(round(i.total_price*least(100,greatest(0,coalesce(d.discount_percent,0)))/100,2)),0) into discount
    from order_items i left join customer_product_discounts d on d.product_id=i.product_id and d.user_id=p_user and d.is_active where i.order_id=oid;
   select orders.subtotal into subtotal from orders where id=oid;
   select gateway_commissions->'WALLET' into rates from payment_gateway_settings where id=true;
   total:=greatest(0,subtotal-discount);
   if coalesce((rates->>'enabled')::boolean,false) then
    rate_type:=case when rates->>'type'='FIXED' then 'FIXED' else 'PERCENTAGE' end;
    rate_value:=greatest(0,coalesce((rates->>'value')::numeric,0));
    fee:=round(case when rate_type='FIXED' then rate_value else total*rate_value/100 end,2);
   end if;
   update orders set discount=portal_prices.discount,payment_fee=fee,payment_fee_type=rate_type,payment_fee_value=case when rate_type is null then null else rate_value end,total=portal_prices.total+fee where id=oid;
   update payments set amount=total+fee where order_id=oid;
  end if;
  select o.subtotal,o.discount,o.payment_fee,o.total into subtotal,discount,fee,total from orders o where o.id=oid;
  select jsonb_agg(jsonb_build_object('productName',i.product_name,'optionName',i.option_name,'quantity',i.quantity,
    'unitPrice',round(i.unit_price*(1-case when has_seller then 0 else least(100,greatest(0,coalesce(d.discount_percent,0)))/100 end),2),
    'lineTotal',i.total_price-round(i.total_price*(case when has_seller then 0 else least(100,greatest(0,coalesce(d.discount_percent,0)))/100 end),2)) order by i.created_at,i.id) into lines
    from order_items i left join customer_product_discounts d on d.product_id=i.product_id and d.user_id=p_user and d.is_active where i.order_id=oid;
  result:=jsonb_build_object('items',lines,'subtotal',subtotal,'discount',discount,'fee',coalesce(fee,0),'total',total,'currency','USD','walletBalance',balance_before,'balanceAfter',balance_before-total,'reference',coalesce(p_reference,''),'paymentMethod','WALLET');
  if p_action='quote' then raise exception using errcode='P0Q01',message='Rollback quote'; end if;
  if p_expected is null or p_expected::text in ('NaN','Infinity','-Infinity') or total<>p_expected then raise exception 'The order price changed. Review the order again.'; end if;
  update orders set order_number=next_portal_order_number() where id=oid;
  paid:=pay_order_with_wallet(oid,p_user);
  -- Keep manually delivered items processing, and never release supplier-owned reservations.
  update gift_card_codes set status='AVAILABLE',order_item_id=null,reserved_at=null,sold_at=null
   where status='RESERVED' and order_item_id in(select i.id from order_items i join products p on p.id=i.product_id where i.order_id=oid and (p.delivery_type='MANUAL' or i.fulfillment_mode='RANGE_MANUAL') and not exists(select 1 from definiteplay_jobs j where j.item_id=i.id));
  update orders set status='PROCESSING',delivered_at=null where id=oid and status in ('PAID','PROCESSING') and exists(select 1 from order_items i join products p on p.id=i.product_id where i.order_id=oid and (p.delivery_type='MANUAL' or i.fulfillment_mode='RANGE_MANUAL') and not exists(select 1 from definiteplay_jobs j where j.item_id=i.id));
  select result||jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,'status',o.status,'replayed',false) into result from orders o where o.id=oid;
  insert into portal_wallet_orders(user_id,request_id,payload,expected_total,order_id,result) values(p_user,p_request,payload,p_expected,oid,result);
 exception when sqlstate 'P0Q01' then
  -- PL/pgSQL variables survive rollback of this inner transaction; all order writes do not.
  null;
 end;
 return result;
end $$;
revoke all on function public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text) from public,anon,authenticated;
grant execute on function public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text) to service_role;
commit;
