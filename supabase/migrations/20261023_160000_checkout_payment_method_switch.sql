begin;

alter table public.payments add column if not exists checkout_revision integer not null default 0;
create table if not exists public.checkout_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  method text not null,
  gateway_order_id text,
  payment_snapshot jsonb not null,
  superseded_at timestamptz not null default now(),
  received_transaction_id text,
  received_at timestamptz
);
create unique index if not exists checkout_attempt_gateway_once on public.checkout_payment_attempts(order_id,method)
  where gateway_order_id is not null;
create index if not exists checkout_attempt_order_idx on public.checkout_payment_attempts(order_id,superseded_at);
alter table public.checkout_payment_attempts enable row level security;
revoke all on public.checkout_payment_attempts from public,anon,authenticated;
grant all on public.checkout_payment_attempts to service_role;

-- Webhooks can still verify the original signed invoice after a method change.
create or replace view public.checkout_gateway_payments with (security_invoker=true) as
  select id,order_id,method::text,status::text,gateway_order_id,gateway_payment_id,amount,currency,transaction_id from payments
  union all
  select payment_id,order_id,method,'PENDING',gateway_order_id,payment_snapshot->>'gateway_payment_id',
    (payment_snapshot->>'amount')::numeric,payment_snapshot->>'currency',received_transaction_id
  from checkout_payment_attempts where gateway_order_id is not null;
revoke all on public.checkout_gateway_payments from public,anon,authenticated;
grant select on public.checkout_gateway_payments to service_role;

create or replace function public.switch_checkout_payment_method(
  p_order_id uuid,p_method text,p_variant text,p_access_hash text,p_expected_revision integer,p_expected_total numeric
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; p payments%rowtype; settings jsonb; config jsonb;
  base numeric; fee numeric; rate numeric; rate_type text; new_total numeric;
begin
  if p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid order access.'; end if;
  if p_method is null or p_variant is null or not (
    (p_method='UPI' and p_variant in ('manual_upi','upi')) or
    (p_method='WALLET' and p_variant='wallet') or (p_method='PALLY' and p_variant='pally') or
    (p_method='BINANCE_PAY' and p_variant='binance') or (p_method='FREEKASSA' and p_variant='freekassa') or
    (p_method='PAYPAL' and p_variant='paypal') or (p_method='USDT_DIRECT' and p_variant='usdt')
  ) then raise exception 'Invalid payment method.'; end if;
  select * into strict o from orders where id=p_order_id for update;
  perform assert_checkout_open(o.id);
  select * into strict p from payments where order_id=o.id for update;
  if p_expected_revision is distinct from p.checkout_revision then raise exception 'Payment details changed. Reopen payment options.'; end if;
  if p.status<>'PENDING' or p.verified_at is not null or p.submitted_at is not null
    or nullif(btrim(p.transaction_id),'') is not null or nullif(btrim(p.screenshot_url),'') is not null
    or exists(select 1 from wallet_transactions where order_id=o.id)
    or exists(select 1 from checkout_payment_attempts where order_id=o.id and received_at is not null)
  then raise exception 'Check the payment status before paying again.'; end if;
  if p.method::text=p_method and (p_method<>'UPI' or p.checkout_variant=p_variant) then
    if p_expected_total is distinct from o.total then raise exception 'Payment total changed. Reopen payment options.'; end if;
    update orders set access_token_hash=p_access_hash where id=o.id;
    return prepare_order_payment_retry(o.id,p_access_hash);
  end if;
  if p.checkout_creation_token is not null or exists(select 1 from paypal_checkouts where order_id=o.id and paypal_order_id is null) then
    raise exception 'A payment is being prepared. Wait for it to finish before changing the method.';
  end if;
  if exists(select 1 from checkout_payment_attempts where order_id=o.id and method=p_method and gateway_order_id is not null) then
    raise exception 'That payment method was already replaced on this order. Choose another method.';
  end if;
  select gateway_commissions into settings from payment_gateway_settings where id=true;
  if not found then raise exception 'Payment settings unavailable.'; end if;
  config:=coalesce(settings->p_method,'{}'::jsonb);
  if config->>'enabled'='false' or (p_method in ('UPI','PAYPAL') and coalesce(config->>'enabled','false')<>'true') then
    raise exception 'This payment method is currently unavailable.';
  end if;
  if not exists(select 1 from order_items where order_id=o.id) or exists(
    select 1 from order_items i left join products pr on pr.id=i.product_id where i.order_id=o.id
    and (pr.id is null or not coalesce(p_method=any(pr.allowed_payment_methods),p_method<>'PAYPAL'))
  ) then raise exception 'This payment method is not allowed for these products.'; end if;
  base:=o.total-coalesce(o.payment_fee,0);
  if base<=0 or o.currency<>'USD' then raise exception 'This order requires payment support.'; end if;
  rate:=greatest(0,coalesce((config->>'value')::numeric,0));
  rate_type:=case when config->>'enabled'='true' then case when config->>'type'='FIXED' then 'FIXED' else 'PERCENTAGE' end end;
  fee:=case when rate_type is null then 0 when rate_type='FIXED' then round(rate,2) else round(base*rate/100,2) end;
  new_total:=round(base+fee,2);
  if p_expected_total is distinct from new_total then raise exception 'Payment total changed. Reopen payment options.'; end if;
  insert into checkout_payment_attempts(order_id,payment_id,method,gateway_order_id,payment_snapshot)
    values(o.id,p.id,p.method::text,p.gateway_order_id,to_jsonb(p));
  update payments set method=p_method::public.payment_method,checkout_variant=p_variant,amount=new_total,
    gateway_order_id=null,gateway_payment_id=null,gateway_checkout_url=null,checkout_creation_token=null,
    checkout_creation_started_at=null,gateway_status_checked_at=null,gateway_last_status=null,
    rejection_reason=null,rejected_at=null,checkout_revision=checkout_revision+1,updated_at=now() where id=p.id;
  update orders set total=new_total,payment_fee=fee,payment_fee_type=rate_type,
    payment_fee_value=case when rate_type is null then null else rate end,access_token_hash=p_access_hash,updated_at=now() where id=o.id;
  return prepare_order_payment_retry(o.id,p_access_hash);
end $$;

-- Never fulfill using a replaced invoice. Preserve the receipt for staff review,
-- including when the customer has already paid via their new method.
create or replace function public.record_superseded_checkout_payment(p_attempt_id uuid,p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a checkout_payment_attempts%rowtype; o orders%rowtype;
begin
  select * into strict a from checkout_payment_attempts where id=p_attempt_id;
  select * into strict o from orders where id=a.order_id for update;
  select * into strict a from checkout_payment_attempts where id=p_attempt_id for update;
  if nullif(btrim(p_transaction_id),'') is null then raise exception 'Missing payment transaction.'; end if;
  if a.received_transaction_id is not null and a.received_transaction_id<>btrim(p_transaction_id) then raise exception 'A different payment transaction is already recorded.'; end if;
  if a.received_at is null then
    update checkout_payment_attempts set received_at=now(),received_transaction_id=btrim(p_transaction_id) where id=a.id;
    update orders set status=case when paid_at is null then 'PAYMENT_REVIEW'::order_status else status end,
      admin_note=concat_ws(E'\n',nullif(admin_note,''),'Payment received through replaced '||a.method||' checkout. Review the payment attempt before delivery or refund.'),updated_at=now() where id=o.id;
  end if;
  return jsonb_build_object('orderId',o.id,'requiresReview',true);
end $$;

create or replace function public.hold_switched_checkout_payment(p_payment_id uuid,p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;
begin
  select * into strict p from payments where id=p_payment_id for update;
  if p.status='VERIFIED' or not exists(select 1 from checkout_payment_attempts where order_id=p.order_id and received_at is not null) then return null; end if;
  if nullif(btrim(p_transaction_id),'') is null or (p.transaction_id is not null and p.transaction_id<>btrim(p_transaction_id)) then raise exception 'Payment transaction mismatch.'; end if;
  update payments set status='SUBMITTED',transaction_id=btrim(p_transaction_id),gateway_payment_id=btrim(p_transaction_id),submitted_at=coalesce(submitted_at,now()),
    rejection_reason='Payments received through multiple methods. Review before delivery.',updated_at=now() where id=p.id;
  return jsonb_build_object('orderId',p.order_id,'requiresReview',true);
end $$;

create or replace function public.complete_checkout_attempt(p_payment_id uuid,p_method text,p_prepay_id text,p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype; attempt_id uuid; held jsonb;
begin
  select * into strict p from payments where id=p_payment_id;
  perform 1 from orders where id=p.order_id for update;
  select * into strict p from payments where id=p_payment_id for update;
  if p.method::text=p_method and p.gateway_order_id=btrim(p_prepay_id) then
    held:=hold_switched_checkout_payment(p.id,p_transaction_id);
    if held is not null then return held; end if;
    return complete_binance_payment(p.id,p_prepay_id,p_transaction_id);
  end if;
  select id into attempt_id from checkout_payment_attempts where payment_id=p.id and method=p_method and gateway_order_id=btrim(p_prepay_id);
  if attempt_id is null then raise exception 'Payment attempt verification failed.'; end if;
  return record_superseded_checkout_payment(attempt_id,p_transaction_id);
end $$;

create or replace function public.complete_paypal_checkout_attempt(p_order_id uuid,p_paypal_order_id text,p_capture_id text,p_merchant_id text,p_amount numeric,p_currency text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c paypal_checkouts%rowtype; p payments%rowtype; attempt_id uuid; held jsonb;
begin
  perform 1 from orders where id=p_order_id for update;
  select * into strict c from paypal_checkouts where order_id=p_order_id for update;
  select * into strict p from payments where id=c.payment_id for update;
  if c.paypal_order_id is distinct from p_paypal_order_id or c.merchant_id is distinct from p_merchant_id
    or p_merchant_id is null or p_paypal_order_id is null or c.amount is distinct from p_amount or p_currency is distinct from 'USD'
    or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{10,32}$' or (c.capture_id is not null and c.capture_id<>p_capture_id)
  then raise exception 'Payment verification failed.'; end if;
  if p.method::text='PAYPAL' and p.gateway_order_id=p_paypal_order_id then
    held:=hold_switched_checkout_payment(p.id,p_capture_id);
    if held is null then return complete_paypal_checkout(p_order_id,p_paypal_order_id,p_capture_id,p_merchant_id,p_amount,p_currency); end if;
  else
    select id into attempt_id from checkout_payment_attempts where order_id=p_order_id and method='PAYPAL' and gateway_order_id=p_paypal_order_id;
    if attempt_id is null then raise exception 'PayPal attempt verification failed.'; end if;
    held:=record_superseded_checkout_payment(attempt_id,p_capture_id);
  end if;
  update paypal_checkouts set capture_id=p_capture_id,completed_at=coalesce(completed_at,now()),delivery_pending=false where order_id=p_order_id;
  return held;
end $$;


-- Authenticated provider notices that funds are confirming or held also prevent switching.
create or replace function public.hold_checkout_attempt(p_payment_id uuid,p_method text,p_prepay_id text,p_transaction_id text,p_compliance boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype; attempt_id uuid;
begin
  select * into strict p from payments where id=p_payment_id;
  perform 1 from orders where id=p.order_id for update;
  select * into strict p from payments where id=p_payment_id for update;
  if p.method::text=p_method and p.gateway_order_id=btrim(p_prepay_id) then
    if p.status='VERIFIED' then return jsonb_build_object('alreadyCompleted',true); end if;
    update payments set status='SUBMITTED',submitted_at=coalesce(submitted_at,now()),updated_at=now() where id=p.id;
    if p_compliance then update orders set status='PAYMENT_REVIEW',updated_at=now() where id=p.order_id and paid_at is null; end if;
    return jsonb_build_object('requiresReview',true);
  end if;
  select id into attempt_id from checkout_payment_attempts where payment_id=p.id and method=p_method and gateway_order_id=btrim(p_prepay_id);
  if attempt_id is null then raise exception 'Payment attempt verification failed.'; end if;
  return record_superseded_checkout_payment(attempt_id,p_transaction_id);
end $$;

-- A capture already in flight must finish before a customer can switch methods.
do $$ declare definition text; anchor text;
begin
  select pg_get_functiondef('public.check_paypal_capture(uuid)'::regprocedure) into definition;
  if position('-- checkout-switch-capture-v1' in definition)=0 then
    anchor:='  return coalesce(v_order.status=';
    if position(anchor in definition)=0 then raise exception 'Unrecognized PayPal capture function'; end if;
    execute replace(definition,anchor,E'  -- checkout-switch-capture-v1\n  if v_order.status=''PENDING_PAYMENT'' and v_payment.method=''PAYPAL'' and v_payment.status=''PENDING'' and v_checkout.paypal_order_id=v_payment.gateway_order_id then\n    update public.payments set checkout_creation_token=coalesce(checkout_creation_token,gen_random_uuid()),checkout_creation_started_at=now() where id=v_payment.id;\n  end if;\n'||anchor);
  end if;
end $$;

create or replace function public.submit_checkout_manual_payment(p_order_id uuid,p_access_hash text,p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  select * into strict o from orders where id=p_order_id for update;
  if p_access_hash is null or o.access_token_hash is distinct from p_access_hash then raise exception 'Payment details changed. Reopen this order.'; end if;
  return submit_manual_payment(o.id,o.order_number,o.customer_email,p_transaction_id,'');
end $$;

revoke all on function public.hold_checkout_attempt(uuid,text,text,text,boolean),public.switch_checkout_payment_method(uuid,text,text,text,integer,numeric),
 public.record_superseded_checkout_payment(uuid,text),public.hold_switched_checkout_payment(uuid,text),
 public.complete_checkout_attempt(uuid,text,text,text),public.complete_paypal_checkout_attempt(uuid,text,text,text,numeric,text),
 public.submit_checkout_manual_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.hold_checkout_attempt(uuid,text,text,text,boolean),public.switch_checkout_payment_method(uuid,text,text,text,integer,numeric),
 public.complete_checkout_attempt(uuid,text,text,text),public.complete_paypal_checkout_attempt(uuid,text,text,text,numeric,text),
 public.submit_checkout_manual_payment(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
