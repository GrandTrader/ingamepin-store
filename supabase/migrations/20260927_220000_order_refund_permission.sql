begin;
-- Missing rows mean disabled. Only the admin RPC may change this setting.
create table public.order_refund_permissions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.order_refund_permissions enable row level security;
revoke all on public.order_refund_permissions from public,anon,authenticated,service_role;
grant select on public.order_refund_permissions to service_role;

create function public.set_order_refund_permission(p_order_id uuid,p_admin_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_admin_id is null or not exists(select 1 from admin_users where user_id=p_admin_id) then
    raise exception 'Administrator access is required.';
  end if;
  if p_enabled is null then raise exception 'Choose whether to enable customer refunds.'; end if;
  perform 1 from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if exists(select 1 from order_refund_requests where order_id=p_order_id and status<>'REJECTED') then
    raise exception 'This order already has a refund request. Review the existing request.';
  end if;
  if p_enabled then perform assert_order_refundable(p_order_id); end if;
  insert into order_refund_permissions(order_id,enabled,updated_by)
    values(p_order_id,p_enabled,p_admin_id)
    on conflict(order_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  return p_enabled;
end;
$$;
revoke all on function public.set_order_refund_permission(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_order_refund_permission(uuid,uuid,boolean) to service_role;

-- Check inside the same transaction/order lock as every refund request.
-- Existing requests are unaffected, including retries and admin completion.
create function public.require_order_refund_permission() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from orders where id=NEW.order_id for update;
  if not exists(select 1 from order_refund_permissions where order_id=NEW.order_id and enabled=true) then
    raise exception 'Refund requests are not enabled for this order. Contact support.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.require_order_refund_permission() from public,anon,authenticated,service_role;
create trigger customer_refund_permission_guard before insert on public.order_refund_requests
  for each row execute function public.require_order_refund_permission();
notify pgrst, 'reload schema';
commit;
