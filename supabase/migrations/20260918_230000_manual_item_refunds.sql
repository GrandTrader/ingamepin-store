-- Record money already returned by an administrator. This function never moves funds.
begin;
alter table public.order_item_refunds
  add column if not exists refund_destination text,
  add column if not exists transaction_id text;
alter table public.order_item_refunds drop constraint if exists order_item_refunds_status_check;
alter table public.order_item_refunds add constraint order_item_refunds_status_check
  check (status in ('PENDING_CLAIM','CREDITED','CANCELLED','MANUALLY_REFUNDED'));
alter table public.order_item_refunds drop constraint if exists order_item_refunds_claim_state;
alter table public.order_item_refunds add constraint order_item_refunds_claim_state check (
  (status = 'PENDING_CLAIM' and claimed_by is null and claimed_at is null)
  or (status = 'CREDITED' and claimed_by is not null and claimed_at is not null)
  or status in ('CANCELLED','MANUALLY_REFUNDED')
);
alter table public.order_item_refunds drop constraint if exists order_item_refunds_amount_matches_quantity;
alter table public.order_item_refunds add constraint order_item_refunds_amount_matches_quantity
  check (status = 'MANUALLY_REFUNDED' or amount = round(unit_amount * quantity, 2));
alter table public.order_item_refunds add constraint order_item_refunds_manual_details check (
  status <> 'MANUALLY_REFUNDED' or (
    refund_destination is not null and refund_destination in ('WALLET','PAYMENT_METHOD')
    and transaction_id is not null and length(trim(transaction_id)) between 3 and 200
    and claimed_by is null and claimed_at is null
  )
);
create unique index order_item_refunds_manual_reference_idx
  on public.order_item_refunds(order_item_id, refund_destination, transaction_id)
  where status = 'MANUALLY_REFUNDED';

create or replace function public.record_manual_item_refund(
  p_order_id uuid, p_item_id uuid, p_admin_user_id uuid,
  p_quantity integer, p_amount numeric, p_destination text,
  p_transaction_id text, p_reason text
) returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_existing public.order_item_refunds%rowtype;
  v_refunded_quantity integer;
  v_refunded_amount numeric;
  v_order_refunded_amount numeric;
  v_id uuid;
begin
  if p_admin_user_id is null or not exists (select 1 from public.admin_users where user_id = p_admin_user_id) then
    raise exception 'Administrator access is required.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_amount is null or p_amount <= 0
    or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <> round(p_amount,2) then
    raise exception 'Enter a positive quantity and refund amount with at most two decimal places.';
  end if;
  if p_destination is null or p_destination not in ('WALLET','PAYMENT_METHOD') then
    raise exception 'Select the refund destination.';
  end if;
  if length(trim(coalesce(p_transaction_id,''))) not between 3 and 200
    or length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'A valid transaction ID and reason are required.';
  end if;
  -- Order lock serializes refunds across denominations and service completion.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  select * into v_item from public.order_items where id = p_item_id and order_id = p_order_id for update;
  if not found then raise exception 'Order denomination was not found.'; end if;
  select * into v_existing from public.order_item_refunds
    where order_item_id = p_item_id and status = 'MANUALLY_REFUNDED'
      and refund_destination = p_destination and transaction_id = trim(p_transaction_id);
  if found then
    if v_existing.quantity = p_quantity and v_existing.amount = p_amount and v_existing.reason = trim(p_reason) then
      return v_existing.id;
    end if;
    raise exception 'This transaction ID is already recorded for this denomination.';
  end if;
  if v_order.status not in ('PAID','PROCESSING','DELIVERED') then
    raise exception 'Only paid orders can be refunded.';
  end if;
  select coalesce(sum(quantity),0), coalesce(sum(amount),0)
    into v_refunded_quantity, v_refunded_amount from public.order_item_refunds
    where order_item_id = p_item_id and status <> 'CANCELLED';
  select coalesce(sum(amount),0) into v_order_refunded_amount from public.order_item_refunds
    where order_id = p_order_id and status <> 'CANCELLED';
  if p_quantity > v_item.quantity - v_refunded_quantity then
    raise exception 'Refund quantity exceeds the unrefunded quantity.';
  end if;
  if p_amount > v_item.total_price - v_refunded_amount or p_amount > v_order.total - v_order_refunded_amount then
    raise exception 'Refund amount exceeds the remaining paid amount.';
  end if;
  insert into public.order_item_refunds (
    order_id,order_item_id,customer_email,quantity,unit_amount,amount,currency,
    status,reason,created_by,refund_destination,transaction_id
  ) values (
    p_order_id,p_item_id,lower(v_order.customer_email),p_quantity,round(p_amount/p_quantity,2),p_amount,v_order.currency,
    'MANUALLY_REFUNDED',trim(p_reason),p_admin_user_id,p_destination,trim(p_transaction_id)
  ) returning id into v_id;
  if not exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id and oi.quantity >
      coalesce((select sum(r.quantity) from public.order_item_refunds r
        where r.order_item_id = oi.id and r.status in ('CREDITED','MANUALLY_REFUNDED')),0)
  ) then
    update public.orders set status = 'REFUNDED', updated_at = now() where id = p_order_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.record_manual_item_refund(uuid,uuid,uuid,integer,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.record_manual_item_refund(uuid,uuid,uuid,integer,numeric,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
