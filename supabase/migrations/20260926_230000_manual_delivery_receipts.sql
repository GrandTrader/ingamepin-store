-- Private proof of UID / in-account delivery. Run once before deploying receipt UI.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-receipts', 'delivery-receipts', false, 3145728,
  array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.order_delivery_receipts (
  order_item_id uuid primary key references public.order_items(id),
  order_id uuid not null references public.orders(id),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists order_delivery_receipts_order_id_idx on public.order_delivery_receipts(order_id);
alter table public.order_delivery_receipts enable row level security;
revoke all on public.order_delivery_receipts from anon, authenticated;
grant select, insert on public.order_delivery_receipts to service_role;

create or replace function public.complete_manual_service_with_receipt(
  p_order_id uuid, p_item_id uuid, p_admin_user_id uuid, p_receipt_path text
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_result jsonb;
  v_item public.order_items%rowtype;
begin
  if not exists (select 1 from public.admin_users where user_id = p_admin_user_id) then
    raise exception 'Administrator access is required.';
  end if;
  -- Match the existing completion function's lock order to serialize retries.
  perform 1 from public.orders where id = p_order_id for update;
  select * into v_item from public.order_items
    where id = p_item_id and order_id = p_order_id for update;
  if not found then raise exception 'Order item was not found.'; end if;
  if v_item.service_delivered_at is not null then
    return public.complete_manual_service_item(p_order_id, p_item_id, p_admin_user_id);
  end if;
  if p_receipt_path is null or p_receipt_path not like p_order_id::text || '/' || p_item_id::text || '/%'
    or p_receipt_path like '%..%'
    or not exists (select 1 from storage.objects where bucket_id = 'delivery-receipts' and name = p_receipt_path) then
    raise exception 'Upload a valid receipt before completing delivery.';
  end if;
  -- Existing function validates payment, manual delivery, previous codes and refunds.
  -- Receipt insertion and order completion commit or roll back together.
  v_result := public.complete_manual_service_item(p_order_id, p_item_id, p_admin_user_id);
  insert into public.order_delivery_receipts(order_item_id, order_id, storage_path, uploaded_by)
    values (p_item_id, p_order_id, p_receipt_path, p_admin_user_id);
  return v_result;
end;
$$;
revoke all on function public.complete_manual_service_with_receipt(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_manual_service_with_receipt(uuid, uuid, uuid, text) to service_role;
commit;
