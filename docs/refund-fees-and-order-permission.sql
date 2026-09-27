-- Run this combined update once if neither the fee nor per-order permission migration has been applied.
-- Preserve existing requests at their previously agreed zero fee.
begin;
alter table public.order_refund_requests
  add column crypto_network text,
  add column network_fee numeric(12,2) not null default 0,
  add column net_amount numeric(12,2) generated always as (amount - network_fee) stored,
  add constraint order_refund_fee_valid check (
    network_fee >= 0 and network_fee < amount and
    (network_fee = 0 or (refund_method = 'USDT_DIRECT' and currency = 'USD'))
  );

-- Keep the original ownership, payment, delivery and idempotency checks.
-- The internal function must not be callable by application clients.
alter function public.request_customer_order_refund(uuid,uuid,text,text,text)
  rename to request_customer_order_refund_without_fee_internal;
revoke all on function public.request_customer_order_refund_without_fee_internal(uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;

create function public.request_customer_order_refund(
  p_order_id uuid,p_customer_id uuid,p_method text,p_details text,p_reason text,p_network text default null
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare rid uuid; existing_id uuid; fee numeric(12,2) := 0; r order_refund_requests%rowtype;
begin
  -- Serialize retries with the original request and all delivery/refund operations.
  perform 1 from orders where id=p_order_id for update;
  select id into existing_id from order_refund_requests where order_id=p_order_id and status<>'REJECTED';
  rid := request_customer_order_refund_without_fee_internal(p_order_id,p_customer_id,p_method,p_details,p_reason);
  if existing_id is not null then return rid; end if;
  if p_method='USDT_DIRECT' then
    fee := case p_network when 'TRC20' then 4.50 when 'SOLANA' then 2.50
      when 'BEP20' then 0.50 when 'OTHER' then 3.50 else null end;
    if fee is null then raise exception 'Select a crypto refund network. Reload the order before trying again.'; end if;
    select * into r from order_refund_requests where id=rid;
    if r.currency<>'USD' then raise exception 'Crypto refunds require an order in USD. Choose another refund method or contact support.'; end if;
    if r.amount<=fee then raise exception 'The refund amount must be greater than the network fee. Choose another refund method.'; end if;
  end if;
  update order_refund_requests set network_fee=fee,
    crypto_network=case when p_method='USDT_DIRECT' then p_network else null end
    where id=rid returning * into r;
  update order_refund_events set note='Customer requested an order refund. Delivery paused. Order amount: '||r.currency||' '||r.amount||
    '. Network fee / commission: '||r.currency||' '||r.network_fee||'. Customer receives: '||r.currency||' '||r.net_amount||'.'
    where request_id=rid and status='REQUESTED';
  return rid;
end;
$$;
revoke all on function public.request_customer_order_refund(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_customer_order_refund(uuid,uuid,text,text,text,text) to service_role;

-- Completion remains manual for external transfers; record the agreed net amount.
create function public.record_customer_refund_payout_note() returns trigger
language plpgsql security definer set search_path=public as $$
declare r order_refund_requests%rowtype;
begin
  if NEW.status='COMPLETED' then
    select * into r from order_refund_requests where id=NEW.request_id;
    NEW.note := 'Refund completed. Sent: '||r.currency||' '||r.net_amount||
      '. Network fee / commission: '||r.currency||' '||r.network_fee||
      '. Order cancelled. Reference: '||coalesce(r.transaction_id,'');
  end if;
  return NEW;
end;
$$;
revoke all on function public.record_customer_refund_payout_note() from public,anon,authenticated,service_role;
create trigger customer_refund_payout_note before insert on public.order_refund_events
  for each row execute function public.record_customer_refund_payout_note();
notify pgrst, 'reload schema';


-- Missing rows mean disabled. Only the admin RPC may change this setting.
create table public.order_refund_permissions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.order_refund_permissions enable row level security;
revoke all on public.order_refund_permissions from public,anon,authenticated,service_role;
grant select on public.order_refund_permissions to service_role;

create function public.set_order_refund_permission(p_order_id uuid,p_admin_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_admin_id is null or not exists(select 1 from admin_users where user_id=p_admin_id) then
    raise exception 'Administrator access is required.';
  end if;
  if p_enabled is null then raise exception 'Choose whether to enable customer refunds.'; end if;
  perform 1 from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if exists(select 1 from order_refund_requests where order_id=p_order_id and status<>'REJECTED') then
    raise exception 'This order already has a refund request. Review the existing request.';
  end if;
  if p_enabled then perform assert_order_refundable(p_order_id); end if;
  insert into order_refund_permissions(order_id,enabled,updated_by)
    values(p_order_id,p_enabled,p_admin_id)
    on conflict(order_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  return p_enabled;
end;
$$;
revoke all on function public.set_order_refund_permission(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_order_refund_permission(uuid,uuid,boolean) to service_role;

-- Check inside the same transaction/order lock as every refund request.
-- Existing requests are unaffected, including retries and admin completion.
create function public.require_order_refund_permission() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from orders where id=NEW.order_id for update;
  if not exists(select 1 from order_refund_permissions where order_id=NEW.order_id and enabled=true) then
    raise exception 'Refund requests are not enabled for this order. Contact support.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.require_order_refund_permission() from public,anon,authenticated,service_role;
create trigger customer_refund_permission_guard before insert on public.order_refund_requests
  for each row execute function public.require_order_refund_permission();
notify pgrst, 'reload schema';
commit;
