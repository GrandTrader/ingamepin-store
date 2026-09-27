-- Full-order refunds requested by a verified customer, reviewed by an admin.
begin;
create table public.order_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  original_method text not null,
  refund_method text not null check (refund_method in ('WALLET','BINANCE_PAY','USDT_DIRECT','PALLY','FREEKASSA','UPI','PAYTM')),
  payout_details text not null default '' check (length(payout_details) <= 1000),
  reason text not null check (length(reason) between 3 and 1000),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','COMPLETED','REJECTED')),
  admin_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  transaction_id text,
  wallet_transaction_id uuid references public.wallet_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'COMPLETED' or (completed_at is not null and completed_by is not null and length(transaction_id) >= 3))
);
create unique index order_refund_requests_one_open on public.order_refund_requests(order_id) where status <> 'REJECTED';
create index order_refund_requests_queue on public.order_refund_requests(status,created_at);
create index order_refund_requests_customer on public.order_refund_requests(customer_id,created_at);
create table public.order_refund_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.order_refund_requests(id),
  actor_id uuid not null references auth.users(id),
  status text not null,
  note text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index order_refund_events_request on public.order_refund_events(request_id,created_at);
alter table public.order_refund_requests enable row level security;
alter table public.order_refund_events enable row level security;
revoke all on public.order_refund_requests, public.order_refund_events from anon,authenticated;
grant all on public.order_refund_requests, public.order_refund_events to service_role;

create function public.assert_order_refundable(p_order_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id=p_order_id for update;
  if not found or o.status not in ('PAID','PROCESSING') or o.paid_at is null or o.delivered_at is not null or o.total<=0 or o.total::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Only paid orders that have not been delivered can be refunded.';
  end if;
  if not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency=o.currency and amount>=o.total) then
    raise exception 'Order payment has not been confirmed.';
  end if;
  if not exists(select 1 from order_items where order_id=o.id) or
     exists(select 1 from order_items where order_id=o.id and service_delivered_at is not null) or
     exists(select 1 from gift_card_codes c join order_items i on i.id=c.order_item_id where i.order_id=o.id and c.status='SOLD') or
     exists(select 1 from order_delivery_receipts where order_id=o.id) then
    raise exception 'This order has already been partly or fully delivered.';
  end if;
  if exists(select 1 from order_item_refunds where order_id=o.id and status<>'CANCELLED') then
    raise exception 'This order already has a refund. Contact support for any remaining amount.';
  end if;
  if exists(select 1 from definiteplay_jobs where order_id=o.id and (state='DELIVERED' or (submitted_at is not null and state<>'REJECTED'))) then
    raise exception 'A supplier purchase is in progress. Contact support to resolve it before requesting a refund.';
  end if;
end;
$$;

create function public.request_customer_order_refund(p_order_id uuid,p_customer_id uuid,p_method text,p_details text,p_reason text)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare o orders%rowtype; u auth.users%rowtype; p payments%rowtype; r order_refund_requests%rowtype; settings jsonb; rid uuid;
begin
  select * into u from auth.users where id=p_customer_id and email_confirmed_at is not null;
  if not found then raise exception 'Sign in with a verified email to request a refund.'; end if;
  select * into o from orders where id=p_order_id for update;
  if not found or (o.customer_id is not null and o.customer_id<>u.id) or lower(o.customer_email)<>lower(u.email) then
    raise exception 'Order not found for this account.';
  end if;
  select * into r from order_refund_requests where order_id=o.id and status<>'REJECTED';
  if found then return r.id; end if;
  perform assert_order_refundable(o.id);
  if p_method is null or p_method not in ('WALLET','BINANCE_PAY','USDT_DIRECT','PALLY','FREEKASSA','UPI','PAYTM') then raise exception 'Choose an available refund method.'; end if;
  select * into p from payments where order_id=o.id and status='VERIFIED' and currency=o.currency and amount>=o.total order by verified_at desc nulls last,created_at desc limit 1;
  select gateway_commissions into settings from payment_gateway_settings where id=true;
  if p_method<>'WALLET' and p_method<>p.method::text and (
    case when p_method in ('UPI','PAYTM') then coalesce(settings->p_method->>'enabled','false')<>'true'
    else coalesce(settings->p_method->>'enabled','true')='false' end
  ) then raise exception 'This refund method is unavailable. Reload the order.'; end if;
  if p_method='WALLET' and o.currency<>'USD' then raise exception 'Wallet refunds require an order in USD.'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 or length(coalesce(p_details,''))>1000 then raise exception 'Enter a reason and valid refund details.'; end if;
  if p_method not in ('WALLET',p.method::text) and length(trim(coalesce(p_details,'')))<3 then raise exception 'Enter the receiving account or wallet details for this method.'; end if;
  insert into order_refund_requests(order_id,customer_id,payment_id,amount,currency,original_method,refund_method,payout_details,reason)
    values(o.id,u.id,p.id,o.total,o.currency,p.method::text,p_method,trim(coalesce(p_details,'')),trim(p_reason)) returning id into rid;
  -- Prevent a leased but not submitted supplier job from starting after the request.
  update definiteplay_jobs set state='REVIEW',issue='Refund request '||rid,lease_token=null,lease_until=null,updated_at=now()
    where order_id=o.id and state='QUEUED' and submitted_at is null;
  insert into order_refund_events(request_id,actor_id,status,note) values(rid,u.id,'REQUESTED','Customer requested a full refund. Delivery paused.');
  return rid;
end;
$$;

create function public.review_customer_order_refund(p_request_id uuid,p_admin_id uuid,p_action text,p_note text default '',p_reference text default '')
returns text language plpgsql security definer set search_path=public as $$
declare r order_refund_requests%rowtype; oid uuid; o orders%rowtype; before_balance numeric; wallet_currency text; tid uuid; ref text;
begin
  if p_admin_id is null or not exists(select 1 from admin_users where user_id=p_admin_id) then raise exception 'Administrator access is required.'; end if;
  if p_action is null or p_action not in ('APPROVE','REJECT','COMPLETE') or length(coalesce(p_note,''))>1000 then raise exception 'Invalid refund action.'; end if;
  select order_id into oid from order_refund_requests where id=p_request_id;
  select * into o from orders where id=oid for update;
  select * into r from order_refund_requests where id=p_request_id for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if r.status='COMPLETED' then return r.status; end if;
  if r.status='REJECTED' then
    if p_action='REJECT' then return r.status; end if;
    raise exception 'This request was rejected.';
  end if;
  if p_action='REJECT' then
    if r.status<>'REQUESTED' then raise exception 'An approved refund cannot be rejected after transfer may have started.'; end if;
    if length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter the reason for rejecting this request.'; end if;
    update order_refund_requests set status='REJECTED',admin_note=trim(p_note),reviewed_by=p_admin_id,reviewed_at=now(),updated_at=now() where id=r.id;
    update definiteplay_jobs set state='QUEUED',issue=null,next_check=now(),updated_at=now() where order_id=o.id and state='REVIEW' and submitted_at is null and issue='Refund request '||r.id;
    insert into order_refund_events(request_id,actor_id,status,note) values(r.id,p_admin_id,'REJECTED',trim(p_note));
    return 'REJECTED';
  end if;
  perform assert_order_refundable(o.id);
  if o.total<>r.amount or o.currency<>r.currency or not exists(select 1 from payments where id=r.payment_id and order_id=o.id and status='VERIFIED' and currency=r.currency and amount>=r.amount) then
    raise exception 'Payment or order amount changed. Review the order before refunding.';
  end if;
  if p_action='APPROVE' and r.status='APPROVED' then return r.status; end if;
  if p_action='COMPLETE' and (r.status<>'APPROVED' or r.refund_method='WALLET') then raise exception 'Approve the refund before recording the completed transfer.'; end if;
  if p_action='APPROVE' then
    update order_refund_requests set status='APPROVED',admin_note=trim(coalesce(p_note,'')),reviewed_by=p_admin_id,reviewed_at=now(),updated_at=now() where id=r.id;
    insert into order_refund_events(request_id,actor_id,status,note) values(r.id,p_admin_id,'APPROVED',case when r.refund_method='WALLET' then 'Approved for wallet credit.' else 'Approved; awaiting external refund transfer.' end);
    if r.refund_method<>'WALLET' then return 'APPROVED'; end if;
  end if;
  if r.refund_method='WALLET' then
    insert into customer_wallets(user_id,balance,currency) values(r.customer_id,0,r.currency) on conflict(user_id) do nothing;
    select balance,currency into before_balance,wallet_currency from customer_wallets where user_id=r.customer_id for update;
    if wallet_currency<>r.currency then raise exception 'Wallet currency does not match the refund.'; end if;
    update customer_wallets set balance=balance+r.amount,updated_at=now() where user_id=r.customer_id;
    insert into wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,description,order_id,reference_id)
      values(r.customer_id,'REFUND',r.amount,before_balance,before_balance+r.amount,'Approved order refund: '||o.order_number,o.id,r.id::text) returning id into tid;
    ref:=tid::text;
  else
    ref:=trim(coalesce(p_reference,''));
    if length(ref) not between 3 and 200 then raise exception 'Enter the completed refund transaction ID.'; end if;
  end if;
  update order_refund_requests set status='COMPLETED',completed_by=p_admin_id,completed_at=now(),transaction_id=ref,wallet_transaction_id=tid,
    admin_note=case when length(trim(coalesce(p_note,'')))>0 then trim(p_note) else admin_note end,updated_at=now() where id=r.id;
  -- Money and final order state are committed together; no cancellation on approval alone.
  update payments set status='REFUNDED',updated_at=now() where id=r.payment_id;
  update orders set status='CANCELLED',updated_at=now() where id=o.id;
  update gift_card_codes set status='AVAILABLE',order_item_id=null,reserved_at=null where status='RESERVED' and order_item_id in(select id from order_items where order_id=o.id);
  insert into order_refund_events(request_id,actor_id,status,note) values(r.id,p_admin_id,'COMPLETED','Refund completed. Order cancelled. Reference: '||ref);
  return 'COMPLETED';
end;
$$;

-- All delivery paths and older admin refund tools must respect the same order lock.
create function public.guard_customer_refund_hold() returns trigger
language plpgsql security definer set search_path=public as $$
declare oid uuid; held boolean;
begin
  if TG_OP='DELETE' then
    if TG_TABLE_NAME='gift_card_codes' then select order_id into oid from order_items where id=OLD.order_item_id;
    elsif TG_TABLE_NAME='orders' then oid:=OLD.id;
    else oid:=OLD.order_id; end if;
    perform 1 from orders where id=oid for update;
    if exists(select 1 from order_refund_requests where order_id=oid and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Refund history locks this order against deletion.'; end if;
    return OLD;
  end if;
  if TG_TABLE_NAME in ('order_items','payments') and TG_OP='UPDATE' then
    if NEW.order_id is distinct from OLD.order_id then
      perform 1 from orders where id=OLD.order_id for update;
      if exists(select 1 from order_refund_requests where order_id=OLD.order_id and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Refund history locks this order against reassignment.'; end if;
    end if;
  end if;
  if TG_TABLE_NAME='orders' then oid:=OLD.id;
  elsif TG_TABLE_NAME='gift_card_codes' then
    select order_id into oid from order_items where id=NEW.order_item_id;
  else oid:=NEW.order_id; end if;
  if oid is null then return NEW; end if;
  perform 1 from orders where id=oid for update;
  select exists(select 1 from order_refund_requests where order_id=oid and status in ('REQUESTED','APPROVED','COMPLETED')) into held;
  if not held then return NEW; end if;
  if TG_TABLE_NAME='orders' then
    if exists(select 1 from order_refund_requests where order_id=oid and status='COMPLETED') then
      if NEW.status<>'CANCELLED' then raise exception 'This order was refunded and cancelled.'; end if;
    elsif NEW.status is distinct from OLD.status or NEW.delivered_at is distinct from OLD.delivered_at then
      raise exception 'Resolve the customer refund request before changing order status.';
    end if;
    if NEW.total is distinct from OLD.total or NEW.currency is distinct from OLD.currency or NEW.customer_id is distinct from OLD.customer_id or NEW.customer_email is distinct from OLD.customer_email then raise exception 'Order details are locked by a refund request.'; end if;
  elsif TG_TABLE_NAME='gift_card_codes' then
    if NEW.status in ('SOLD','RESERVED') then raise exception 'Delivery is paused for a customer refund request.'; end if;
  elsif TG_TABLE_NAME='definiteplay_jobs' then
    if NEW.submitted_at is distinct from OLD.submitted_at or NEW.state='DELIVERED' then raise exception 'Supplier purchase is paused for a customer refund request.'; end if;
  elsif TG_TABLE_NAME='payments' then
    if exists(select 1 from order_refund_requests where order_id=oid and payment_id=NEW.id) and
      (NEW.amount is distinct from OLD.amount or NEW.currency is distinct from OLD.currency or NEW.method is distinct from OLD.method or
       (NEW.status is distinct from OLD.status and not (NEW.status='REFUNDED' and exists(select 1 from order_refund_requests where order_id=oid and status='COMPLETED')))) then
      raise exception 'Payment is locked by a customer refund request.';
    end if;
  else raise exception 'Resolve the customer refund request before delivering or issuing another refund.';
  end if;
  return NEW;
end;
$$;
create trigger customer_refund_order_guard before update or delete on public.orders for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_code_guard before insert or update or delete on public.gift_card_codes for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_item_guard before insert or update or delete on public.order_items for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_payment_guard before update on public.payments for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_other_refund_guard before insert or update on public.order_item_refunds for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_supplier_guard before update on public.definiteplay_jobs for each row execute function public.guard_customer_refund_hold();
create trigger customer_refund_receipt_guard before insert or update on public.order_delivery_receipts for each row execute function public.guard_customer_refund_hold();
revoke all on function public.assert_order_refundable(uuid),public.request_customer_order_refund(uuid,uuid,text,text,text),public.review_customer_order_refund(uuid,uuid,text,text,text),public.guard_customer_refund_hold() from public,anon,authenticated;
grant execute on function public.request_customer_order_refund(uuid,uuid,text,text,text),public.review_customer_order_refund(uuid,uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
