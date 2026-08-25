begin;

alter table public.products
  drop constraint if exists products_allowed_payment_methods_check;

update public.products
set allowed_payment_methods = array_append(allowed_payment_methods, 'UPI')
where not (allowed_payment_methods @> array['UPI']::text[]);

alter table public.products
  alter column allowed_payment_methods
  set default array[
    'WALLET',
    'BINANCE_PAY',
    'USDT_DIRECT',
    'PALLY',
    'FREEKASSA',
    'UPI'
  ]::text[];

alter table public.products
  add constraint products_allowed_payment_methods_check
  check (
    cardinality(allowed_payment_methods) > 0
    and allowed_payment_methods <@ array[
      'WALLET',
      'BINANCE_PAY',
      'USDT_DIRECT',
      'PALLY',
      'FREEKASSA',
      'UPI'
    ]::text[]
  );

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
  if btrim(coalesce(p_transaction_id, '')) !~* '^0x[0-9a-f]{64}$' then
    raise exception 'Enter a valid BEP20 transaction hash.';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id
  for update;

  if v_payment.method <> 'UPI' then
    raise exception 'This order does not use manual USDT verification.';
  end if;

  if exists (
    select 1 from public.payments
    where lower(transaction_id) = lower(btrim(p_transaction_id))
      and id <> v_payment.id
  ) then
    raise exception 'This transaction hash was already submitted.';
  end if;

  update public.payments
  set status = 'SUBMITTED',
      transaction_id = lower(btrim(p_transaction_id)),
      screenshot_url = nullif(btrim(coalesce(p_screenshot_path, '')), ''),
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

revoke all on function public.submit_manual_payment(uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.submit_manual_payment(uuid, text, text, text, text)
to service_role;

commit;
