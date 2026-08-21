create table if not exists public.order_item_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  quantity integer not null check (quantity > 0),
  unit_amount numeric(12,2) not null check (unit_amount >= 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'PENDING_CLAIM'
    check (status in ('PENDING_CLAIM', 'CREDITED', 'CANCELLED')),
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_item_refunds_amount_matches_quantity
    check (amount = round(unit_amount * quantity, 2)),
  constraint order_item_refunds_claim_state check (
    (status = 'PENDING_CLAIM' and claimed_by is null and claimed_at is null)
    or (status = 'CREDITED' and claimed_by is not null and claimed_at is not null)
    or status = 'CANCELLED'
  )
);

create index if not exists order_item_refunds_order_id_idx
  on public.order_item_refunds(order_id);
create index if not exists order_item_refunds_order_item_id_idx
  on public.order_item_refunds(order_item_id);
create index if not exists order_item_refunds_customer_email_idx
  on public.order_item_refunds(lower(customer_email));
create index if not exists order_item_refunds_pending_claim_idx
  on public.order_item_refunds(lower(customer_email), created_at)
  where status = 'PENDING_CLAIM';

drop trigger if exists set_updated_at on public.order_item_refunds;
create trigger set_updated_at
before update on public.order_item_refunds
for each row execute function public.set_updated_at();

alter table public.order_item_refunds enable row level security;

drop policy if exists "Customers read matching refunds" on public.order_item_refunds;
create policy "Customers read matching refunds"
on public.order_item_refunds for select
using (
  public.is_admin()
  or customer_id = auth.uid()
  or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

revoke all on public.order_item_refunds from anon, authenticated;
grant select on public.order_item_refunds to authenticated;

create or replace function public.credit_order_item_refund(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_email_confirmed_at timestamptz;
  v_refund public.order_item_refunds%rowtype;
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  if v_user_id is null or v_user_email = '' then
    raise exception 'You must sign in with a verified email address.';
  end if;

  select email_confirmed_at into v_email_confirmed_at
  from auth.users where id = v_user_id;
  if v_email_confirmed_at is null then
    raise exception 'Verify your email address before claiming a refund.';
  end if;

  select * into v_refund
  from public.order_item_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.';
  end if;
  if v_refund.status = 'CREDITED' and v_refund.claimed_by = v_user_id then
    select balance into v_after from public.customer_wallets where user_id = v_user_id;
    return jsonb_build_object('refundId', v_refund.id, 'amount', v_refund.amount, 'balance', coalesce(v_after, 0), 'alreadyClaimed', true);
  end if;
  if v_refund.status <> 'PENDING_CLAIM' then
    raise exception 'This refund is not available to claim.';
  end if;
  if lower(v_refund.customer_email) <> v_user_email then
    raise exception 'Sign in using the same email address used for the order.';
  end if;

  insert into public.customer_wallets(user_id, balance, currency)
  values (v_user_id, 0, v_refund.currency)
  on conflict (user_id) do nothing;

  select balance into v_before
  from public.customer_wallets
  where user_id = v_user_id
  for update;

  v_after := v_before + v_refund.amount;

  update public.customer_wallets
  set balance = v_after, updated_at = now()
  where user_id = v_user_id;

  insert into public.wallet_transactions (
    user_id, transaction_type, amount, balance_before, balance_after,
    description, order_id, reference_id
  ) values (
    v_user_id, 'REFUND', v_refund.amount, v_before, v_after,
    'Wallet refund for order item', v_refund.order_id, v_refund.id::text
  );

  update public.order_item_refunds
  set status = 'CREDITED', customer_id = v_user_id, claimed_by = v_user_id,
      claimed_at = now(), updated_at = now()
  where id = v_refund.id;

  return jsonb_build_object('refundId', v_refund.id, 'amount', v_refund.amount, 'balance', v_after, 'alreadyClaimed', false);
end;
$$;

revoke all on function public.credit_order_item_refund(uuid) from public, anon;
grant execute on function public.credit_order_item_refund(uuid) to authenticated;

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

  insert into public.order_item_refunds (
    order_id, order_item_id, customer_id, customer_email, quantity,
    unit_amount, amount, currency, reason, created_by
  ) values (
    v_order.id, v_item.id, v_customer_id, lower(v_order.customer_email), p_quantity,
    v_item.unit_price, round(v_item.unit_price * p_quantity, 2), v_order.currency,
    trim(p_reason), v_admin_id
  ) returning id into v_refund_id;

  return v_refund_id;
end;
$$;

revoke all on function public.create_order_item_wallet_refund(uuid, integer, text) from public, anon;
grant execute on function public.create_order_item_wallet_refund(uuid, integer, text) to authenticated;
