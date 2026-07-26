create or replace function public.complete_wallet_gateway_topup(
  p_request_id uuid,
  p_gateway_order_id text,
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
  v_gateway_name text;
begin
  select * into v_request
  from public.wallet_topup_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Wallet top-up was not found.';
  end if;

  if v_request.gateway_order_id is distinct from btrim(p_gateway_order_id) then
    raise exception 'Wallet payment verification failed.';
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
  set balance = v_after,
      updated_at = now()
  where user_id = v_request.user_id;

  v_gateway_name := case v_request.payment_method
    when 'BINANCE_PAY' then 'Binance Pay'
    when 'FREEKASSA' then 'FreeKassa'
    when 'USDT_DIRECT' then 'Direct USDT'
    when 'PALLY' then 'PayPalych'
    else replace(initcap(lower(v_request.payment_method)), '_', ' ')
  end;

  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    reference_id
  )
  values (
    v_request.user_id,
    'CREDIT',
    v_request.amount,
    v_before,
    v_after,
    v_gateway_name || ' wallet top-up',
    v_request.id::text
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

revoke all on function public.complete_wallet_gateway_topup(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.complete_wallet_gateway_topup(uuid, text, text)
to service_role;
