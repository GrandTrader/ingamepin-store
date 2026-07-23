create or replace function public.submit_manual_payment(
  p_order_id uuid,
  p_order_number text,
  p_customer_email text,
  p_transaction_id text,
  p_screenshot_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
    and order_number = btrim(p_order_number)
    and lower(customer_email) = lower(btrim(p_customer_email))
  for update;

  if not found then raise exception 'Order verification failed.'; end if;
  if v_order.status <> 'PENDING_PAYMENT' then
    raise exception 'This order cannot accept another payment submission.';
  end if;
  if btrim(coalesce(p_transaction_id, '')) !~ '^[A-Z0-9]{6,40}$' then
    raise exception 'Enter a valid transaction or UTR number.';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id
  for update;

  if v_payment.method <> 'UPI' then
    raise exception 'This order does not use UPI verification.';
  end if;

  if exists (
    select 1 from public.payments
    where upper(transaction_id) = upper(btrim(p_transaction_id))
      and id <> v_payment.id
  ) then
    raise exception 'This transaction reference was already submitted.';
  end if;

  update public.payments
  set status = 'SUBMITTED',
      transaction_id = upper(btrim(p_transaction_id)),
      screenshot_url = btrim(p_screenshot_path),
      submitted_at = now(),
      rejection_reason = null,
      rejected_at = null,
      updated_at = now()
  where id = v_payment.id;

  update public.orders
  set status = 'PAYMENT_REVIEW', updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'orderId', p_order_id,
    'status', 'PAYMENT_REVIEW'
  );
end;
$$;

create or replace function public.fulfill_instant_items(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
  v_code_id uuid;
  v_index integer;
  v_has_manual boolean := false;
begin
  for v_item in
    select oi.*
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    order by oi.created_at
  loop
    if exists (
      select 1 from public.products
      where id = v_item.product_id and delivery_type = 'MANUAL'
    ) then
      v_has_manual := true;
      continue;
    end if;

    for v_index in 1..v_item.quantity loop
      select id into v_code_id
      from public.gift_card_codes
      where product_id = v_item.product_id
        and product_option_id is not distinct from v_item.product_option_id
        and status = 'AVAILABLE'
      order by created_at
      limit 1
      for update skip locked;

      if v_code_id is null then
        raise exception 'Not enough instant-delivery codes are available for %.',
          v_item.product_name;
      end if;

      update public.gift_card_codes
      set status = 'SOLD',
          order_item_id = v_item.id,
          reserved_at = now(),
          sold_at = now(),
          updated_at = now()
      where id = v_code_id;
      v_code_id := null;
    end loop;

    update public.product_options
    set stock_quantity = greatest(stock_quantity - v_item.quantity, 0),
        updated_at = now()
    where id = v_item.product_option_id;
  end loop;

  return v_has_manual;
end;
$$;

create or replace function public.approve_manual_payment(p_payment_id uuid)
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
  if v_payment.status = 'VERIFIED' then
    select status into v_status from public.orders where id = v_payment.order_id;
    return jsonb_build_object('orderId', v_payment.order_id, 'orderStatus', v_status);
  end if;
  if v_payment.status <> 'SUBMITTED' then
    raise exception 'Only a submitted payment can be approved.';
  end if;

  v_has_manual := public.fulfill_instant_items(v_payment.order_id);
  v_status := case when v_has_manual then 'PAID' else 'DELIVERED' end;

  update public.payments
  set status = 'VERIFIED', verified_at = now(), updated_at = now()
  where id = p_payment_id;

  update public.orders
  set status = v_status,
      paid_at = coalesce(paid_at, now()),
      delivered_at = case when v_status = 'DELIVERED' then now() else null end,
      updated_at = now()
  where id = v_payment.order_id;

  return jsonb_build_object(
    'paymentId', p_payment_id,
    'orderId', v_payment.order_id,
    'orderStatus', v_status
  );
end;
$$;

create or replace function public.reject_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a valid rejection reason.';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'Payment was not found.'; end if;
  if v_payment.status <> 'SUBMITTED' then
    raise exception 'Only a submitted payment can be rejected.';
  end if;

  update public.payments
  set status = 'REJECTED',
      rejection_reason = left(btrim(p_reason), 500),
      rejected_at = now(),
      updated_at = now()
  where id = p_payment_id;

  update public.orders
  set status = 'PENDING_PAYMENT', updated_at = now()
  where id = v_payment.order_id;

  return jsonb_build_object(
    'paymentId', p_payment_id,
    'orderId', v_payment.order_id,
    'orderStatus', 'PENDING_PAYMENT'
  );
end;
$$;

revoke all on function public.submit_manual_payment(
  uuid, text, text, text, text
) from public;
grant execute on function public.submit_manual_payment(
  uuid, text, text, text, text
) to anon, authenticated, service_role;

revoke all on function public.fulfill_instant_items(uuid) from public;
grant execute on function public.fulfill_instant_items(uuid) to service_role;

revoke all on function public.approve_manual_payment(uuid) from public;
grant execute on function public.approve_manual_payment(uuid) to service_role;

revoke all on function public.reject_manual_payment(uuid, text) from public;
grant execute on function public.reject_manual_payment(uuid, text) to service_role;
