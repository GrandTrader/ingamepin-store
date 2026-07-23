create or replace function public.create_wallet_topup_request(
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if p_amount < 10 or p_amount > 100000 then
    raise exception 'Enter an amount between INR 10 and INR 100,000.';
  end if;

  insert into public.wallet_topup_requests (
    user_id, amount, currency, payment_method, payment_reference
  )
  values (
    auth.uid(), p_amount, 'INR', upper(btrim(p_payment_method)),
    btrim(p_payment_reference)
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.approve_wallet_topup(
  p_request_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.wallet_topup_requests%rowtype;
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  if not exists (
    select 1 from public.admin_users where user_id = p_admin_user_id
  ) then raise exception 'Administrator access is required.'; end if;

  select * into v_request
  from public.wallet_topup_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Wallet request was not found.'; end if;
  if v_request.status = 'APPROVED' then
    select balance into v_after from public.customer_wallets
    where user_id = v_request.user_id;
    return jsonb_build_object('amount', v_request.amount, 'balanceAfter', v_after);
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'Only a pending wallet request can be approved.';
  end if;

  insert into public.customer_wallets(user_id, balance, currency)
  values (v_request.user_id, 0, 'INR')
  on conflict (user_id) do nothing;

  select balance into v_before
  from public.customer_wallets
  where user_id = v_request.user_id
  for update;
  v_after := v_before + v_request.amount;

  update public.customer_wallets
  set balance = v_after, updated_at = now()
  where user_id = v_request.user_id;

  insert into public.wallet_transactions (
    user_id, transaction_type, amount, balance_before, balance_after,
    description, reference_id
  )
  values (
    v_request.user_id, 'CREDIT', v_request.amount, v_before, v_after,
    'Wallet top-up approved', v_request.id::text
  );

  update public.wallet_topup_requests
  set status = 'APPROVED', reviewed_by = p_admin_user_id,
      reviewed_at = now(), paid_at = now(), updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('amount', v_request.amount, 'balanceAfter', v_after);
end;
$$;

create or replace function public.reject_wallet_topup(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users where user_id = p_admin_user_id
  ) then raise exception 'Administrator access is required.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a valid rejection reason.';
  end if;

  update public.wallet_topup_requests
  set status = 'REJECTED', rejection_reason = left(btrim(p_reason), 500),
      reviewed_by = p_admin_user_id, reviewed_at = now(), updated_at = now()
  where id = p_request_id and status = 'PENDING';

  if not found then raise exception 'Pending wallet request was not found.'; end if;
  return jsonb_build_object('requestId', p_request_id, 'status', 'REJECTED');
end;
$$;

create or replace function public.pay_order_with_wallet(
  p_order_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_has_manual boolean;
  v_status public.order_status;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_id = p_user_id
  for update;
  if not found then raise exception 'Order was not found.'; end if;
  if v_order.status <> 'PENDING_PAYMENT' then
    raise exception 'This order cannot be paid again.';
  end if;

  select balance into v_before from public.customer_wallets
  where user_id = p_user_id for update;
  if not found or v_before < v_order.total then
    raise exception 'Insufficient wallet balance.';
  end if;

  v_after := v_before - v_order.total;
  update public.customer_wallets
  set balance = v_after, updated_at = now()
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id, transaction_type, amount, balance_before, balance_after,
    description, order_id, reference_id
  )
  values (
    p_user_id, 'DEBIT', v_order.total, v_before, v_after,
    'Store order payment', p_order_id, v_order.order_number
  );

  v_has_manual := public.fulfill_instant_items(p_order_id);
  v_status := case when v_has_manual then 'PAID' else 'DELIVERED' end;

  update public.payments
  set method = 'WALLET', status = 'VERIFIED', verified_at = now(),
      updated_at = now()
  where order_id = p_order_id;

  update public.orders
  set status = v_status, paid_at = now(),
      delivered_at = case when v_status = 'DELIVERED' then now() else null end,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'orderId', p_order_id, 'orderStatus', v_status,
    'amount', v_order.total, 'balanceAfter', v_after
  );
end;
$$;

revoke all on function public.create_wallet_topup_request(numeric, text, text)
from public;
grant execute on function public.create_wallet_topup_request(numeric, text, text)
to authenticated;

revoke all on function public.approve_wallet_topup(uuid, uuid) from public;
revoke all on function public.reject_wallet_topup(uuid, uuid, text) from public;
revoke all on function public.pay_order_with_wallet(uuid, uuid) from public;
grant execute on function public.approve_wallet_topup(uuid, uuid) to service_role;
grant execute on function public.reject_wallet_topup(uuid, uuid, text) to service_role;
grant execute on function public.pay_order_with_wallet(uuid, uuid) to service_role;
