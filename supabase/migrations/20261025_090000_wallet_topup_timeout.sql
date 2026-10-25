-- Reject unattended top-ups without changing wallet balances.
-- Only verified gateway callbacks may recover an automatic timeout rejection.
begin;

alter table public.wallet_topup_requests
  add column if not exists auto_rejected_at timestamptz;

create index if not exists wallet_topup_pending_created_idx
  on public.wallet_topup_requests (created_at, id)
  where status = 'PENDING';

create or replace function public.reject_stale_wallet_topups(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select r.id
    from public.wallet_topup_requests r
    where r.status = 'PENDING'
      and r.created_at <= now() - interval '30 minutes'
      and (p_user_id is null or r.user_id = p_user_id)
      and r.paid_at is null
      and nullif(btrim(r.gateway_transaction_id), '') is null
      and not exists (
        select 1 from public.wallet_transactions t
        where t.user_id = r.user_id
          and t.reference_id = r.id::text
          and t.transaction_type = 'CREDIT'
      )
    order by r.created_at, r.id
    for update of r skip locked
  )
  update public.wallet_topup_requests r
  set status = 'REJECTED',
      rejection_reason = 'Payment was not confirmed within 30 minutes. Start a new top-up if you still want to add money.',
      auto_rejected_at = now(),
      reviewed_at = now(),
      updated_at = now()
  from due
  where r.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reject_stale_wallet_topups(uuid) from public, anon, authenticated;
grant execute on function public.reject_stale_wallet_topups(uuid) to service_role;

-- Preserve the same safe late-confirmation behavior for the previous automatic expiry.
update public.wallet_topup_requests
set status = 'REJECTED',
    auto_rejected_at = coalesce(updated_at, now()),
    rejection_reason = 'Payment was not confirmed within 30 minutes. Start a new top-up if you still want to add money.'
where status = 'EXPIRED'
  and rejection_reason = 'Payment session expired. Start a new top-up if you still want to add money.'
  and reviewed_by is null
  and paid_at is null
  and nullif(btrim(gateway_transaction_id), '') is null;

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

  if nullif(btrim(p_gateway_order_id), '') is null
    or nullif(btrim(p_transaction_id), '') is null
    or v_request.gateway_order_id is distinct from btrim(p_gateway_order_id) then
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

  if v_request.status <> 'PENDING'
    and not (v_request.status = 'REJECTED' and v_request.auto_rejected_at is not null and v_request.reviewed_by is null) then
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
      rejection_reason = null,
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
  if nullif(btrim(p_prepay_id), '') is null
    or nullif(btrim(p_transaction_id), '') is null
    or v_request.gateway_order_id is distinct from btrim(p_prepay_id) then
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
  if v_request.status <> 'PENDING'
    and not (v_request.status = 'REJECTED' and v_request.auto_rejected_at is not null and v_request.reviewed_by is null) then
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
      rejection_reason = null,
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


revoke all on function public.complete_wallet_gateway_topup(uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_binance_wallet_topup(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_wallet_gateway_topup(uuid, text, text) to service_role;
grant execute on function public.complete_binance_wallet_topup(uuid, text, text) to service_role;

commit;
