-- Record service completion independently; never create placeholder voucher codes.
alter table public.order_items
  add column if not exists service_delivered_at timestamptz,
  add column if not exists service_delivered_by uuid references auth.users(id);

create or replace function public.complete_manual_service_item(
  p_order_id uuid, p_item_id uuid, p_admin_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_complete boolean;
begin
  if not exists (select 1 from public.admin_users where user_id = p_admin_user_id) then
    raise exception 'Administrator access is required.';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  select oi.* into v_item from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.id = p_item_id and oi.order_id = p_order_id and p.delivery_type = 'MANUAL'
    for update of oi;
  if not found then raise exception 'The UID/account delivery item is invalid.'; end if;
  if v_order.status not in ('PAID', 'PROCESSING') then
    if v_order.status = 'DELIVERED' and v_item.service_delivered_at is not null then
      return jsonb_build_object('orderStatus', v_order.status, 'alreadyCompleted', true);
    end if;
    raise exception 'Only a paid processing order can be completed.';
  end if;
  if v_item.service_delivered_at is not null then
    return jsonb_build_object('orderStatus', v_order.status, 'alreadyCompleted', true);
  end if;
  if exists (select 1 from public.gift_card_codes where order_item_id = p_item_id and status = 'SOLD')
    or exists (select 1 from public.order_item_refunds where order_item_id = p_item_id and status <> 'CANCELLED') then
    raise exception 'This item already has codes or refunds. Complete its existing delivery process.';
  end if;
  update public.order_items set fulfillment_mode = 'PLAYER_ID_TOPUP',
    service_delivered_at = now(), service_delivered_by = p_admin_user_id
    where id = p_item_id;
  select not exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id
      and oi.service_delivered_at is null
      and (oi.fulfillment_mode = 'PLAYER_ID_TOPUP' or
        (select count(*) from public.gift_card_codes gc where gc.order_item_id = oi.id and gc.status = 'SOLD') +
        coalesce((select sum(r.quantity) from public.order_item_refunds r where r.order_item_id = oi.id and r.status <> 'CANCELLED'), 0) <> oi.quantity)
  ) into v_complete;
  if v_complete then
    update public.orders set status = 'DELIVERED', delivered_at = now(), updated_at = now() where id = p_order_id;
  end if;
  return jsonb_build_object('orderStatus', case when v_complete then 'DELIVERED' else v_order.status::text end,
    'alreadyCompleted', false, 'orderItemId', p_item_id);
end;
$$;
revoke all on function public.complete_manual_service_item(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_manual_service_item(uuid, uuid, uuid) to service_role;
