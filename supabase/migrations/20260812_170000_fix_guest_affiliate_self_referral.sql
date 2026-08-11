begin;

create or replace function public.record_paid_affiliate_commissions(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_affiliate public.affiliate_accounts%rowtype;
  v_settings public.affiliate_settings%rowtype;
  v_affiliate_email text;
  v_self_referral boolean := false;
  v_status text;
  v_risk_flags jsonb := '[]'::jsonb;
  v_rejection_reason text;
  v_inserted integer := 0;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
     or v_order.affiliate_id is null
     or v_order.paid_at is null
     or v_order.status not in ('PAID', 'PROCESSING', 'DELIVERED') then
    return 0;
  end if;

  select *
  into v_affiliate
  from public.affiliate_accounts
  where id = v_order.affiliate_id;

  if not found then
    return 0;
  end if;

  select *
  into v_settings
  from public.affiliate_settings
  where id = 1;

  if not found then
    return 0;
  end if;

  select email
  into v_affiliate_email
  from auth.users
  where id = v_affiliate.user_id;

  v_self_referral := coalesce(
    v_order.customer_id = v_affiliate.user_id
    or (
      v_affiliate_email is not null
      and lower(btrim(v_order.customer_email)) =
          lower(btrim(v_affiliate_email))
    ),
    false
  );

  if v_self_referral then
    v_status := 'CANCELLED';
    v_risk_flags := jsonb_build_array('SELF_REFERRAL');
    v_rejection_reason := 'Self-referral purchases do not earn commission.';
  elsif v_affiliate.status <> 'APPROVED' then
    v_status := 'CANCELLED';
    v_risk_flags := jsonb_build_array('AFFILIATE_NOT_APPROVED');
    v_rejection_reason := 'The affiliate account was not approved when payment completed.';
  else
    v_status := 'PENDING';
  end if;

  insert into public.affiliate_commissions (
    affiliate_id,
    order_id,
    order_item_id,
    product_id,
    commission_percent,
    commission_amount,
    currency,
    status,
    available_at,
    self_referral,
    risk_flags,
    rejection_reason
  )
  select
    v_affiliate.id,
    v_order.id,
    item.id,
    item.product_id,
    item.affiliate_commission_percent,
    item.affiliate_markup_amount,
    'USDT',
    v_status,
    v_order.paid_at + make_interval(days => v_settings.holding_days),
    v_self_referral,
    v_risk_flags,
    v_rejection_reason
  from public.order_items item
  where item.order_id = v_order.id
    and item.affiliate_commission_percent > 0
    and item.affiliate_markup_amount > 0
  on conflict (order_item_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.record_paid_affiliate_commissions(uuid)
  from public;

grant execute on function public.record_paid_affiliate_commissions(uuid)
  to service_role;

comment on function public.record_paid_affiliate_commissions(uuid) is
  'Creates affiliate commission snapshots after verified payment and safely handles guest orders without a customer ID.';

commit;
