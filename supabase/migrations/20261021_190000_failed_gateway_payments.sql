begin;

alter table public.payments add column if not exists gateway_status_checked_at timestamptz;
alter table public.payments add column if not exists gateway_last_status text;
create index if not exists payments_pending_gateway_check_idx
  on public.payments (gateway_status_checked_at asc nulls first, created_at)
  where status='PENDING' and gateway_order_id is not null;

-- Provider status is checked by the server, never accepted from a browser.
-- Both rows change in one transaction; payment completion uses these same locks.
create or replace function public.fail_unpaid_gateway_payment(
  p_payment_id uuid, p_method text, p_gateway_order_id text, p_gateway_status text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  p payments%rowtype;
  o orders%rowtype;
begin
  if not coalesce((
    (p_method='PALLY' and p_gateway_status='FAIL') or
    (p_method='FREEKASSA' and p_gateway_status in ('8','9')) or
    (p_method='BINANCE_PAY' and p_gateway_status in ('CANCELED','EXPIRED')) or
    (p_method='NOWPAYMENTS' and p_gateway_status in ('failed','expired')) or
    (p_method='PAYPAL' and p_gateway_status='VOIDED')
  ), false) then raise exception 'Unconfirmed payment failure'; end if;
  -- PayPal completion locks the order first; other gateways lock payment first.
  if p_method='PAYPAL' then
    select * into o from orders where id=(select order_id from payments where id=p_payment_id) for update;
  end if;
  select * into p from payments where id=p_payment_id for update;
  if not found or p.method::text<>p_method or nullif(p_gateway_order_id,'') is null
    or p.gateway_order_id is distinct from p_gateway_order_id then
    raise exception 'Payment reference does not match';
  end if;
  select * into strict o from orders where id=p.order_id for update;
  if p.status='FAILED' and o.status='CANCELLED' then
    return jsonb_build_object('released',true,'alreadyReleased',true,'orderId',o.id);
  end if;
  if p.status<>'PENDING' or p.verified_at is not null or p.submitted_at is not null
    or nullif(btrim(p.transaction_id),'') is not null
    or o.status<>'PENDING_PAYMENT' or o.paid_at is not null or o.delivered_at is not null
    or exists(select 1 from payments other where other.order_id=o.id and other.id<>p.id
      and (other.status in ('PENDING','SUBMITTED','VERIFIED','REFUNDED') or other.verified_at is not null))
    or exists(select 1 from order_items i where i.order_id=o.id and i.service_delivered_at is not null)
    or exists(select 1 from gift_card_codes c join order_items i on i.id=c.order_item_id
      where i.order_id=o.id and c.status='SOLD')
  then return jsonb_build_object('released',false,'orderId',o.id); end if;

  update payments set status='FAILED',gateway_last_status=p_gateway_status,
    gateway_status_checked_at=now(),rejection_reason='Gateway confirmed unpaid failure: '||p_method||' / '||p_gateway_status,
    updated_at=now() where id=p.id;
  update orders set status='CANCELLED',updated_at=now() where id=o.id;
  return jsonb_build_object('released',true,'alreadyReleased',false,'orderId',o.id);
end $$;

revoke all on function public.fail_unpaid_gateway_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fail_unpaid_gateway_payment(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
