create or replace function public.complete_binance_payment(
  p_payment_id uuid,
  p_prepay_id text,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_has_manual boolean;
  v_status public.order_status;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'Payment was not found.'; end if;
  if v_payment.gateway_order_id is distinct from btrim(p_prepay_id) then
    raise exception 'Binance Pay order verification failed.';
  end if;
  if v_payment.status = 'VERIFIED' then
    select status into v_status from public.orders where id = v_payment.order_id;
    return jsonb_build_object(
      'orderId', v_payment.order_id,
      'orderStatus', v_status,
      'alreadyCompleted', true
    );
  end if;
  if v_payment.status not in ('PENDING', 'SUBMITTED') then
    raise exception 'This payment cannot be completed.';
  end if;

  v_has_manual := public.fulfill_instant_items(v_payment.order_id);
  v_status := case when v_has_manual then 'PAID' else 'DELIVERED' end;

  update public.payments
  set status = 'VERIFIED',
      gateway_payment_id = btrim(p_transaction_id),
      transaction_id = btrim(p_transaction_id),
      verified_at = now(),
      updated_at = now()
  where id = p_payment_id;

  update public.orders
  set status = v_status,
      paid_at = coalesce(paid_at, now()),
      delivered_at = case when v_status = 'DELIVERED' then now() else null end,
      updated_at = now()
  where id = v_payment.order_id;

  return jsonb_build_object(
    'orderId', v_payment.order_id,
    'orderStatus', v_status,
    'alreadyCompleted', false
  );
end;
$$;

create or replace function public.complete_binance_wallet_topup(
  p_request_id uuid,
  p_prepay_id text,
  p_transaction_id text
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
  select * into v_request
  from public.wallet_topup_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Wallet top-up was not found.'; end if;
  if v_request.gateway_order_id is distinct from btrim(p_prepay_id) then
    raise exception 'Binance Pay wallet verification failed.';
  end if;
  if v_request.status = 'APPROVED' then
    select balance into v_after
    from public.customer_wallets
    where user_id = v_request.user_id;
    return jsonb_build_object(
      'amount', v_request.amount,
      'balanceAfter', v_after,
      'alreadyCompleted', true
    );
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'This wallet top-up cannot be completed.';
  end if;

  insert into public.customer_wallets(user_id, balance, currency)
  values (v_request.user_id, 0, 'USD')
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
    'Binance Pay wallet top-up', v_request.id::text
  );

  update public.wallet_topup_requests
  set status = 'APPROVED',
      gateway_transaction_id = btrim(p_transaction_id),
      paid_at = now(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'amount', v_request.amount,
    'balanceAfter', v_after,
    'alreadyCompleted', false
  );
end;
$$;

revoke all on function public.complete_binance_payment(uuid, text, text)
from public;
revoke all on function public.complete_binance_wallet_topup(uuid, text, text)
from public;
grant execute on function public.complete_binance_payment(uuid, text, text)
to service_role;
grant execute on function public.complete_binance_wallet_topup(uuid, text, text)
to service_role;
