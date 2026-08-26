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

  select * into v_item
  from public.order_items
  where id = p_order_item_id
  for update;

  if not found then
    raise exception 'Order denomination was not found.';
  end if;

  select * into v_order
  from public.orders
  where id = v_item.order_id
  for update;

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

  select id into v_customer_id
  from auth.users
  where lower(email) = lower(v_order.customer_email)
  order by created_at asc
  limit 1;

  if v_customer_id is null then
    raise exception 'The customer must create an account using % before a direct wallet refund can be issued.', lower(v_order.customer_email);
  end if;

  insert into public.customer_wallets(user_id, balance, currency)
  values (v_customer_id, 0, v_order.currency)
  on conflict (user_id) do nothing;

  select balance, currency into v_before, v_wallet_currency
  from public.customer_wallets
  where user_id = v_customer_id
  for update;

  if v_wallet_currency <> v_order.currency then
    raise exception 'Customer wallet currency does not match the refund currency.';
  end if;

  v_amount := round(v_item.unit_price * p_quantity, 2);
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

  update public.customer_wallets
  set balance = v_after, updated_at = now()
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
