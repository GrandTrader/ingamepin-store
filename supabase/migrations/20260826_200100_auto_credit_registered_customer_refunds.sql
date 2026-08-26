create or replace function public.create_order_item_wallet_refund(
  p_order_item_id uuid,
  p_quantity integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_sold_quantity integer;
  v_refunded_quantity integer;
  v_refund_id uuid;
  v_customer_id uuid;
  v_wallet_currency text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_amount numeric(12,2);
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Refund quantity must be at least 1.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A refund reason is required.';
  end if;

  select * into v_item from public.order_items
  where id = p_order_item_id for update;
  if not found then raise exception 'Order denomination was not found.'; end if;

  select * into v_order from public.orders
  where id = v_item.order_id for update;
  if v_order.status not in ('PAID', 'PROCESSING', 'DELIVERED') then
    raise exception 'Only paid orders can be refunded.';
  end if;

  select count(*)::integer into v_sold_quantity
  from public.gift_card_codes
  where order_item_id = v_item.id and status = 'SOLD';

  select coalesce(sum(quantity), 0)::integer into v_refunded_quantity
  from public.order_item_refunds
  where order_item_id = v_item.id and status <> 'CANCELLED';

  if p_quantity > v_item.quantity - v_sold_quantity - v_refunded_quantity then
    raise exception 'Refund quantity exceeds the undelivered quantity.';
  end if;

  select id into v_customer_id from auth.users
  where lower(email) = lower(v_order.customer_email)
  order by created_at asc limit 1;

  v_amount := round(v_item.unit_price * p_quantity, 2);

  if v_customer_id is null then
    insert into public.order_item_refunds (
      order_id, order_item_id, customer_email, quantity, unit_amount,
      amount, currency, status, reason, created_by
    ) values (
      v_order.id, v_item.id, lower(v_order.customer_email), p_quantity,
      v_item.unit_price, v_amount, v_order.currency, 'PENDING_CLAIM',
      trim(p_reason), v_admin_id
    ) returning id into v_refund_id;

    return v_refund_id;
  end if;

  insert into public.customer_wallets(user_id, balance, currency)
  values (v_customer_id, 0, v_order.currency)
  on conflict (user_id) do nothing;

  select balance, currency into v_before, v_wallet_currency
  from public.customer_wallets where user_id = v_customer_id for update;
  if v_wallet_currency <> v_order.currency then
    raise exception 'Customer wallet currency does not match the refund currency.';
  end if;

  v_after := v_before + v_amount;

  insert into public.order_item_refunds (
    order_id, order_item_id, customer_id, customer_email, quantity,
    unit_amount, amount, currency, status, reason, created_by,
    claimed_by, claimed_at
  ) values (
    v_order.id, v_item.id, v_customer_id, lower(v_order.customer_email),
    p_quantity, v_item.unit_price, v_amount, v_order.currency, 'CREDITED',
    trim(p_reason), v_admin_id, v_customer_id, now()
  ) returning id into v_refund_id;

  update public.customer_wallets set balance = v_after, updated_at = now()
  where user_id = v_customer_id;

  insert into public.wallet_transactions (
    user_id, transaction_type, amount, balance_before, balance_after,
    description, order_id, reference_id
  ) values (
    v_customer_id, 'REFUND', v_amount, v_before, v_after,
    'Direct wallet refund for order item', v_order.id, v_refund_id::text
  );

  return v_refund_id;
end;
$$;

revoke all on function public.create_order_item_wallet_refund(uuid, integer, text) from public, anon;
grant execute on function public.create_order_item_wallet_refund(uuid, integer, text) to authenticated;

do $$
declare
  v_refund record;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_wallet_currency text;
begin
  for v_refund in
    select r.id, r.order_id, r.amount, r.currency, u.id as user_id
    from public.order_item_refunds r
    join lateral (
      select id from auth.users
      where lower(email) = lower(r.customer_email)
      order by created_at asc limit 1
    ) u on true
    where r.status = 'PENDING_CLAIM'
    order by r.created_at
    for update of r
  loop
    insert into public.customer_wallets(user_id, balance, currency)
    values (v_refund.user_id, 0, v_refund.currency)
    on conflict (user_id) do nothing;

    select balance, currency into v_before, v_wallet_currency
    from public.customer_wallets where user_id = v_refund.user_id for update;

    if v_wallet_currency = v_refund.currency then
      v_after := v_before + v_refund.amount;

      update public.customer_wallets set balance = v_after, updated_at = now()
      where user_id = v_refund.user_id;

      insert into public.wallet_transactions (
        user_id, transaction_type, amount, balance_before, balance_after,
        description, order_id, reference_id
      ) values (
        v_refund.user_id, 'REFUND', v_refund.amount, v_before, v_after,
        'Direct wallet refund for order item', v_refund.order_id,
        v_refund.id::text
      );

      update public.order_item_refunds
      set status = 'CREDITED', customer_id = v_refund.user_id,
          claimed_by = v_refund.user_id, claimed_at = now(), updated_at = now()
      where id = v_refund.id and status = 'PENDING_CLAIM';
    end if;
  end loop;
end;
$$;
