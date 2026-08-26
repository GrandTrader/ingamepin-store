create extension if not exists pg_cron with schema extensions;

create index if not exists orders_trashed_at_idx
  on public.orders(trashed_at)
  where status = 'TRASHED';

create or replace function public.cleanup_stale_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moved_count integer := 0;
  deleted_count integer := 0;
begin
  update public.gift_card_codes
  set
    status = 'AVAILABLE',
    order_item_id = null,
    reserved_at = null,
    updated_at = now()
  where status = 'RESERVED'
    and order_item_id in (
      select oi.id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.status = 'PENDING_PAYMENT'
        and o.created_at <= now() - interval '7 days'
    );

  update public.orders
  set
    status = 'TRASHED',
    trashed_at = now(),
    updated_at = now()
  where status = 'PENDING_PAYMENT'
    and created_at <= now() - interval '7 days';

  get diagnostics moved_count = row_count;

  delete from public.orders o
  where o.status = 'TRASHED'
    and o.trashed_at <= now() - interval '30 days'
    and not exists (
      select 1 from public.order_item_refunds r where r.order_id = o.id
    )
    and not exists (
      select 1 from public.affiliate_commissions c where c.order_id = o.id
    );

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'moved_to_trash', moved_count,
    'permanently_deleted', deleted_count
  );
end;
$$;

revoke all on function public.cleanup_stale_orders() from public;
revoke all on function public.cleanup_stale_orders() from anon;
revoke all on function public.cleanup_stale_orders() from authenticated;
grant execute on function public.cleanup_stale_orders() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup-stale-orders';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-stale-orders',
    '15 * * * *',
    'select public.cleanup_stale_orders();'
  );
end;
$$;
