begin;

create or replace function public.approve_affiliate_payout_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.affiliate_payout_requests%rowtype;
  v_commission_total numeric(12,2);
begin
  if not exists (
    select 1 from public.admin_users where user_id = p_admin_user_id
  ) then
    raise exception 'Administrator access is required.';
  end if;

  select * into v_request
  from public.affiliate_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Affiliate payout request was not found.';
  end if;

  if v_request.status <> 'PENDING' then
    raise exception 'Only pending payout requests can be approved.';
  end if;

  select coalesce(sum(commission_amount), 0)
  into v_commission_total
  from public.affiliate_commissions
  where payout_request_id = v_request.id
    and status = 'REQUESTED';

  if round(v_commission_total, 2) <> round(v_request.amount, 2) then
    raise exception 'The requested commission balance does not match this payout.';
  end if;

  update public.affiliate_payout_requests
  set
    status = 'APPROVED',
    reviewed_by = p_admin_user_id,
    reviewed_at = now(),
    rejection_reason = null,
    updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'requestId', v_request.id,
    'status', 'APPROVED',
    'grossAmount', v_request.amount,
    'feeAmount', v_request.fee_amount,
    'netAmount', v_request.net_amount
  );
end;
$$;

create or replace function public.reject_affiliate_payout_request(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.affiliate_payout_requests%rowtype;
  v_reason text;
begin
  if not exists (
    select 1 from public.admin_users where user_id = p_admin_user_id
  ) then
    raise exception 'Administrator access is required.';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Enter a rejection reason between 3 and 500 characters.';
  end if;

  select * into v_request
  from public.affiliate_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Affiliate payout request was not found.';
  end if;

  if v_request.status not in ('PENDING', 'APPROVED') then
    raise exception 'This payout request can no longer be rejected.';
  end if;

  update public.affiliate_commissions
  set
    status = 'AVAILABLE',
    payout_request_id = null,
    updated_at = now()
  where payout_request_id = v_request.id
    and status = 'REQUESTED';

  update public.affiliate_payout_requests
  set
    status = 'REJECTED',
    reviewed_by = p_admin_user_id,
    reviewed_at = now(),
    rejection_reason = v_reason,
    updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'requestId', v_request.id,
    'status', 'REJECTED'
  );
end;
$$;

create or replace function public.mark_affiliate_payout_paid(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.affiliate_payout_requests%rowtype;
  v_transaction_id text;
begin
  if not exists (
    select 1 from public.admin_users where user_id = p_admin_user_id
  ) then
    raise exception 'Administrator access is required.';
  end if;

  v_transaction_id := btrim(coalesce(p_transaction_id, ''));
  if char_length(v_transaction_id) < 6 or char_length(v_transaction_id) > 200 then
    raise exception 'Enter a valid USDT transaction ID.';
  end if;

  select * into v_request
  from public.affiliate_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Affiliate payout request was not found.';
  end if;

  if v_request.status <> 'APPROVED' then
    raise exception 'Approve this payout request before marking it as paid.';
  end if;

  update public.affiliate_commissions
  set
    status = 'PAID',
    updated_at = now()
  where payout_request_id = v_request.id
    and status = 'REQUESTED';

  if not found then
    raise exception 'No requested commissions were found for this payout.';
  end if;

  update public.affiliate_payout_requests
  set
    status = 'PAID',
    transaction_id = v_transaction_id,
    reviewed_by = p_admin_user_id,
    reviewed_at = coalesce(reviewed_at, now()),
    paid_at = now(),
    rejection_reason = null,
    updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'requestId', v_request.id,
    'status', 'PAID',
    'transactionId', v_transaction_id,
    'netAmount', v_request.net_amount,
    'network', v_request.network,
    'walletAddress', v_request.wallet_address
  );
end;
$$;

revoke all on function public.approve_affiliate_payout_request(uuid, uuid) from public;
revoke all on function public.reject_affiliate_payout_request(uuid, uuid, text) from public;
revoke all on function public.mark_affiliate_payout_paid(uuid, uuid, text) from public;

grant execute on function public.approve_affiliate_payout_request(uuid, uuid) to service_role;
grant execute on function public.reject_affiliate_payout_request(uuid, uuid, text) to service_role;
grant execute on function public.mark_affiliate_payout_paid(uuid, uuid, text) to service_role;

commit;
