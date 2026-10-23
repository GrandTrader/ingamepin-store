begin;

alter table public.orders add column if not exists payment_expires_at timestamptz;
alter table public.orders add column if not exists payment_expired_at timestamptz;
update public.orders set payment_expires_at=created_at+interval '15 minutes' where payment_expires_at is null;
alter table public.orders alter column payment_expires_at set default (now()+interval '15 minutes');
alter table public.payments add column if not exists checkout_variant text;
alter table public.payments add column if not exists checkout_creation_token uuid;
alter table public.payments add column if not exists checkout_creation_started_at timestamptz;
create index if not exists unpaid_checkout_expiry_idx on public.orders(payment_expires_at)
  where status='PENDING_PAYMENT' and paid_at is null;

-- Both expiry and settlement lock the same rows. NOWAIT avoids reversing the
-- differing lock order used by wallet, PayPal and the other gateway functions.
create or replace function public.expire_unpaid_checkout(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id=p_order_id for update nowait;
  if not found or o.status<>'PENDING_PAYMENT' or o.paid_at is not null or o.delivered_at is not null
    or coalesce(o.payment_expires_at,o.created_at+interval '15 minutes')>now() then return false; end if;
  perform 1 from payments where order_id=o.id order by id for update nowait;
  if exists(select 1 from payments where order_id=o.id and
       (status not in ('PENDING','FAILED','REJECTED') or verified_at is not null or submitted_at is not null
        or nullif(btrim(transaction_id),'') is not null
        or (checkout_creation_token is not null and checkout_creation_started_at>now()-interval '90 seconds')))
     or exists(select 1 from wallet_transactions where order_id=o.id)
     or exists(select 1 from order_items where order_id=o.id and service_delivered_at is not null)
     or exists(select 1 from gift_card_codes c join order_items i on i.id=c.order_item_id
       where i.order_id=o.id and c.status in ('SOLD','RESERVED'))
  then return false; end if;
  update payments set status='FAILED',rejection_reason='Payment window expired after 15 minutes.',
    updated_at=now() where order_id=o.id and status in ('PENDING','REJECTED');
  update orders set status='CANCELLED',payment_expired_at=now(),updated_at=now() where id=o.id;
  return true;
exception when lock_not_available then return false;
end $$;

create or replace function public.expire_unpaid_checkout_orders(p_limit integer default 200,p_order_ids uuid[] default null)
returns integer language plpgsql security definer set search_path=public as $$
declare row_id uuid; expired integer:=0;
begin
  for row_id in select o.id from orders o
    where status='PENDING_PAYMENT' and paid_at is null and payment_expires_at<=now()
      and (p_order_ids is null or o.id=any(p_order_ids))
      and not exists(select 1 from payments p where p.order_id=o.id and
        (p.status not in ('PENDING','FAILED','REJECTED') or p.verified_at is not null or p.submitted_at is not null
        or nullif(btrim(p.transaction_id),'') is not null
        or (p.checkout_creation_token is not null and p.checkout_creation_started_at>now()-interval '90 seconds')))
      and not exists(select 1 from wallet_transactions w where w.order_id=o.id)
      and not exists(select 1 from order_items i where i.order_id=o.id and i.service_delivered_at is not null)
      and not exists(select 1 from gift_card_codes c join order_items i on i.id=c.order_item_id
        where i.order_id=o.id and c.status in ('SOLD','RESERVED'))
    order by payment_expires_at,id limit greatest(1,least(coalesce(p_limit,200),500))
  loop
    if expire_unpaid_checkout(row_id) then expired:=expired+1; end if;
  end loop;
  return expired;
end $$;

create or replace function public.assert_checkout_open(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id=p_order_id;
  if not found or o.status<>'PENDING_PAYMENT' or o.paid_at is not null then
    raise exception 'This order is no longer awaiting payment.';
  end if;
  if o.payment_expired_at is not null or coalesce(o.payment_expires_at,o.created_at+interval '15 minutes')<=now() then
    raise exception 'The 15-minute payment window has expired. Please create a new order.';
  end if;
end $$;

create or replace function public.prepare_order_payment_retry(p_order_id uuid,p_access_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; p payments%rowtype;
begin
  if p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid order access.'; end if;
  select * into o from orders where id=p_order_id for update;
  perform assert_checkout_open(p_order_id);
  select * into strict p from payments where order_id=o.id for update;
  if p.status<>'PENDING' or p.verified_at is not null or p.submitted_at is not null
    or nullif(btrim(p.transaction_id),'') is not null then raise exception 'Check the payment status before paying again.'; end if;
  update orders set access_token_hash=p_access_hash where id=o.id;
  return jsonb_build_object('id',o.id,'orderNumber',o.order_number,'totalAmount',o.total,
    'currency',o.currency,'paymentMethod',p.method,'checkoutVariant',p.checkout_variant,'createdAt',o.created_at,'expiresAt',o.payment_expires_at);
end $$;

-- A creation token prevents simultaneous clicks from opening several invoices.
-- An uncertain creation is not automatically retried; the original order expires.
create or replace function public.begin_checkout_session(p_order_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype; token uuid;
begin
  perform 1 from orders where id=p_order_id for update;
  perform assert_checkout_open(p_order_id);
  select * into strict p from payments where order_id=p_order_id for update;
  if p.method::text is distinct from p_method or p.status<>'PENDING'
    or p.verified_at is not null or p.submitted_at is not null or nullif(btrim(p.transaction_id),'') is not null
  then raise exception 'This order cannot start another payment.'; end if;
  if p.gateway_order_id is not null then return to_jsonb(p); end if;
  if p.checkout_creation_token is not null then
    raise exception 'The payment session is being prepared. Check this order again before paying.';
  end if;
  token:=gen_random_uuid();
  update payments set checkout_creation_token=token,checkout_creation_started_at=now() where id=p.id returning * into p;
  return to_jsonb(p);
end $$;

-- Called only after a gateway notification/capture has been verified. Late
-- funds are recorded for staff review, without automatic stock delivery.
create or replace function public.hold_expired_checkout_payment(p_payment_id uuid,p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype; o orders%rowtype;
begin
  select * into strict p from payments where id=p_payment_id for update;
  select * into strict o from orders where id=p.order_id for update;
  if p.status='VERIFIED' or o.paid_at is not null then return null; end if;
  if o.payment_expired_at is null and not (o.status='PENDING_PAYMENT'
    and p.status='PENDING' and p.submitted_at is null
    and coalesce(o.payment_expires_at,o.created_at+interval '15 minutes')<=now()) then return null; end if;
  if nullif(btrim(p_transaction_id),'') is null then raise exception 'Missing payment transaction.'; end if;
  if nullif(btrim(p.transaction_id),'') is not null and p.transaction_id<>btrim(p_transaction_id) then
    raise exception 'A different payment transaction is already recorded.';
  end if;
  update payments set status='SUBMITTED',transaction_id=btrim(p_transaction_id),gateway_payment_id=btrim(p_transaction_id),
    submitted_at=coalesce(submitted_at,now()),rejection_reason='Payment received after checkout expired. Review or refund before delivery.',
    updated_at=now() where id=p.id;
  update orders set status='PAYMENT_REVIEW',payment_expired_at=coalesce(payment_expired_at,now()),updated_at=now() where id=o.id;
  return jsonb_build_object('orderId',o.id,'orderStatus','PAYMENT_REVIEW','requiresReview',true);
end $$;

-- Preserve the installed fulfillment implementation, including supplier guards.
do $$
declare definition text; anchor text;
begin
  select pg_get_functiondef('public.complete_binance_payment(uuid,text,text)'::regprocedure) into definition;
  if position('-- checkout-expiry-v1' in definition)=0 then
    anchor:='  if v_payment.status = ''VERIFIED'' then';
    if position(anchor in definition)=0 then raise exception 'Unrecognized gateway completion function'; end if;
    definition:=replace(definition,anchor,E'  -- checkout-expiry-v1\n  declare late jsonb; begin\n    late:=public.hold_expired_checkout_payment(v_payment.id,p_transaction_id);\n    if late is not null then return late; end if;\n  end;\n'||anchor);
    execute definition;
  end if;
  select pg_get_functiondef('public.complete_paypal_checkout(uuid,text,text,text,numeric,text)'::regprocedure) into definition;
  if position('-- checkout-expiry-v1' in definition)=0 then
    anchor:='  if v_already and not v_checkout.delivery_pending then';
    if position(anchor in definition)=0 then raise exception 'Unrecognized PayPal completion function'; end if;
    definition:=replace(definition,anchor,E'  -- checkout-expiry-v1\n  declare late jsonb; begin\n    late:=public.hold_expired_checkout_payment(v_payment.id,p_capture_id);\n    if late is not null then\n      update public.paypal_checkouts set capture_id=p_capture_id,completed_at=coalesce(completed_at,now()),delivery_pending=false where order_id=p_order_id;\n      return late;\n    end if;\n  end;\n'||anchor);
    execute definition;
  end if;
  select pg_get_functiondef('public.pay_order_with_wallet(uuid,uuid)'::regprocedure) into definition;
  if position('-- checkout-expiry-v1' in definition)=0 then
    anchor:='  select balance into v_before from public.customer_wallets';
    if position(anchor in definition)=0 then raise exception 'Unrecognized wallet payment function'; end if;
    execute replace(definition,anchor,E'  -- checkout-expiry-v1\n  perform public.assert_checkout_open(p_order_id);\n  if (select count(*) from public.payments where order_id=p_order_id)<>1 or not exists(select 1 from public.payments where order_id=p_order_id and method=''WALLET'' and status=''PENDING'' and verified_at is null and submitted_at is null and nullif(btrim(transaction_id),'''') is null) then raise exception ''This order cannot start another wallet payment.''; end if;\n'||anchor);
  end if;
  select pg_get_functiondef('public.check_paypal_capture(uuid)'::regprocedure) into definition;
  if position('-- checkout-expiry-v1' in definition)=0 then
    anchor:='  return coalesce(v_order.status=';
    if position(anchor in definition)=0 then raise exception 'Unrecognized PayPal capture check'; end if;
    execute replace(definition,anchor,E'  -- checkout-expiry-v1\n  if coalesce(v_order.payment_expires_at,v_order.created_at+interval ''15 minutes'')<=now() then return false; end if;\n'||anchor);
  end if;
end $$;

revoke all on function public.expire_unpaid_checkout(uuid),public.expire_unpaid_checkout_orders(integer,uuid[]),
 public.assert_checkout_open(uuid),public.prepare_order_payment_retry(uuid,text),public.begin_checkout_session(uuid,text),
 public.hold_expired_checkout_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.expire_unpaid_checkout(uuid),public.expire_unpaid_checkout_orders(integer,uuid[]),
 public.assert_checkout_open(uuid),public.prepare_order_payment_retry(uuid,text),public.begin_checkout_session(uuid,text)
 to service_role;
-- hold_expired_checkout_payment is internal to the verified completion functions.
notify pgrst,'reload schema';
commit;
