-- PayPal stays disabled. No existing products or payments are enabled/changed.
-- Commit the enum before using it in functions (required by PostgreSQL).
begin;
alter type public.payment_method add value if not exists 'PAYPAL';
commit;
begin;

alter table public.products drop constraint if exists products_allowed_payment_methods_check;
alter table public.products add constraint products_allowed_payment_methods_check check (
  cardinality(allowed_payment_methods) > 0 and allowed_payment_methods <@ array[
    'WALLET','BINANCE_PAY','USDT_DIRECT','PALLY','FREEKASSA','UPI','PAYPAL'
  ]::text[]
);

-- Preserve every previously installed checkout safeguard; only extend the method case.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure) into v_definition;
  if position('when ''paypal'' then v_method := ''PAYPAL'';' in v_definition) = 0 then
    if position('when ''freekassa'' then v_method := ''FREEKASSA'';' in v_definition) = 0 then
      raise exception 'Checkout version needs review before installing PayPal.';
    end if;
    v_definition := replace(v_definition, 'when ''freekassa'' then v_method := ''FREEKASSA'';',
      'when ''freekassa'' then v_method := ''FREEKASSA''; when ''paypal'' then v_method := ''PAYPAL'';');
    execute v_definition;
  end if;
end $$;

create table if not exists public.paypal_checkouts (
  order_id uuid primary key references public.orders(id),
  payment_id uuid not null unique references public.payments(id),
  request_id uuid not null unique default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency = 'USD'),
  return_origin text not null,
  paypal_order_id text unique,
  merchant_id text,
  capture_id text unique,
  delivery_pending boolean not null default false,
  notifications_sent_at timestamptz,
  notification_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.paypal_checkouts enable row level security;
revoke all on public.paypal_checkouts from public, anon, authenticated;
grant all on public.paypal_checkouts to service_role;

create or replace function public.paypal_checkout_ready() returns boolean
language sql security definer set search_path = public as $$ select true; $$;

create or replace function public.begin_paypal_checkout(p_order_id uuid, p_return_origin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_payment public.payments%rowtype; v_checkout public.paypal_checkouts%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status <> 'PENDING_PAYMENT' or v_order.currency <> 'USD' or v_order.total <= 0 then
    raise exception 'Order is not payable.';
  end if;
  select * into strict v_payment from public.payments where order_id=p_order_id for update;
  if v_payment.method <> 'PAYPAL' or v_payment.status <> 'PENDING' or v_payment.currency <> 'USD' or v_payment.amount <> v_order.total then
    raise exception 'Payment does not match the order.';
  end if;
  if not exists (select 1 from public.order_items where order_id=p_order_id) or exists (
    select 1 from public.order_items i join public.products p on p.id=i.product_id
    where i.order_id=p_order_id and not coalesce('PAYPAL'=any(p.allowed_payment_methods),false)
  ) then raise exception 'PayPal is not allowed for this product.'; end if;
  if p_return_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then raise exception 'Invalid return origin.'; end if;
  insert into public.paypal_checkouts(order_id,payment_id,amount,currency,return_origin)
    values(p_order_id,v_payment.id,v_order.total,'USD',p_return_origin) on conflict(order_id) do nothing;
  select * into v_checkout from public.paypal_checkouts where order_id=p_order_id;
  if v_checkout.amount <> v_order.total or v_checkout.payment_id <> v_payment.id then raise exception 'Checkout price changed.'; end if;
  return to_jsonb(v_checkout);
end $$;

create or replace function public.attach_paypal_checkout(p_order_id uuid,p_paypal_order_id text,p_merchant_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_checkout public.paypal_checkouts%rowtype;
begin
  if p_paypal_order_id !~ '^[A-Z0-9]{10,32}$' or p_merchant_id !~ '^[A-Z0-9]{10,32}$' or p_paypal_order_id is null or p_merchant_id is null then
    raise exception 'Invalid PayPal identifiers.';
  end if;
  select * into v_checkout from public.paypal_checkouts where order_id=p_order_id for update;
  if not found then raise exception 'Checkout not found.'; end if;
  if v_checkout.paypal_order_id is not null and (v_checkout.paypal_order_id <> p_paypal_order_id or v_checkout.merchant_id is distinct from p_merchant_id) then
    raise exception 'A different checkout already exists.';
  end if;
  update public.paypal_checkouts set paypal_order_id=p_paypal_order_id,merchant_id=p_merchant_id where order_id=p_order_id;
  update public.payments set gateway_order_id=p_paypal_order_id,updated_at=now()
    where id=v_checkout.payment_id and method='PAYPAL' and (gateway_order_id is null or gateway_order_id=p_paypal_order_id);
  if not found then raise exception 'Payment does not match.'; end if;
  return true;
end $$;

create or replace function public.check_paypal_capture(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_payment public.payments%rowtype; v_checkout public.paypal_checkouts%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  select * into v_checkout from public.paypal_checkouts where order_id=p_order_id;
  select * into v_payment from public.payments where id=v_checkout.payment_id for update;
  return coalesce(v_order.status='PENDING_PAYMENT' and v_payment.method='PAYPAL' and v_payment.status='PENDING'
    and v_checkout.paypal_order_id=v_payment.gateway_order_id and v_order.total=v_checkout.amount
    and v_payment.amount=v_checkout.amount and v_order.currency='USD' and v_payment.currency='USD',false);
end $$;

create or replace function public.complete_paypal_checkout(
  p_order_id uuid,p_paypal_order_id text,p_capture_id text,p_merchant_id text,p_amount numeric,p_currency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_checkout public.paypal_checkouts%rowtype; v_payment public.payments%rowtype;
  v_manual boolean; v_already boolean;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  select * into v_checkout from public.paypal_checkouts where order_id=p_order_id for update;
  if not found then raise exception 'Checkout not found.'; end if;
  select * into v_payment from public.payments where id=v_checkout.payment_id for update;
  if v_payment.method is distinct from 'PAYPAL' or v_payment.order_id is distinct from p_order_id
    or v_checkout.paypal_order_id is distinct from p_paypal_order_id or v_payment.gateway_order_id is distinct from p_paypal_order_id
    or v_checkout.merchant_id is distinct from p_merchant_id or p_merchant_id is null or p_paypal_order_id is null
    or v_checkout.amount is distinct from p_amount or v_order.total is distinct from p_amount or v_payment.amount is distinct from p_amount
    or p_currency is distinct from 'USD' or v_order.currency <> 'USD' or v_payment.currency <> 'USD'
    or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{10,32}$' then raise exception 'Payment verification failed.'; end if;
  v_already := v_checkout.capture_id is not null;
  if v_already and v_checkout.capture_id <> p_capture_id then raise exception 'Capture does not match.'; end if;
  if v_already and not v_checkout.delivery_pending then return jsonb_build_object('alreadyCompleted',true); end if;
  if v_already and v_order.status::text not in ('PAID','PROCESSING') then raise exception 'Paid order needs delivery review.'; end if;
  if not v_already and (v_payment.status <> 'PENDING' or v_order.status <> 'PENDING_PAYMENT') then
    raise exception 'Order needs payment review.';
  end if;
  update public.paypal_checkouts set capture_id=p_capture_id,completed_at=coalesce(completed_at,now()),delivery_pending=true where order_id=p_order_id;
  update public.payments set status='VERIFIED',gateway_payment_id=p_capture_id,transaction_id=p_capture_id,
    verified_at=coalesce(verified_at,now()),updated_at=now() where id=v_payment.id;
  update public.orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=p_order_id;
  -- A stock/delivery failure cannot erase the record of money already captured.
  begin
    v_manual := public.fulfill_instant_items(p_order_id);
    update public.orders set status=case when v_manual then 'PAID'::public.order_status else 'DELIVERED'::public.order_status end,
      delivered_at=case when v_manual then null else now() end,updated_at=now() where id=p_order_id;
    update public.paypal_checkouts set delivery_pending=false where order_id=p_order_id;
  exception when others then
    -- Leave the paid order for staff/retry, without releasing partial inventory.
    null;
  end;
  return jsonb_build_object('alreadyCompleted',v_already);
end $$;

revoke all on function public.paypal_checkout_ready(),public.begin_paypal_checkout(uuid,text),
 public.attach_paypal_checkout(uuid,text,text),public.check_paypal_capture(uuid),
 public.complete_paypal_checkout(uuid,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.paypal_checkout_ready(),public.begin_paypal_checkout(uuid,text),
 public.attach_paypal_checkout(uuid,text,text),public.check_paypal_capture(uuid),
 public.complete_paypal_checkout(uuid,text,text,text,numeric,text) to service_role;
notify pgrst,'reload schema';
commit;
