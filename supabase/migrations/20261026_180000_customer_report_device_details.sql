begin;

-- Nullable additions preserve historical observations; no invented backfill.
alter table public.customer_login_events add column if not exists browser_id uuid;
alter table public.customer_login_events add column if not exists device_details jsonb;
alter table public.customer_login_events drop constraint if exists customer_login_events_device_details_size;
alter table public.customer_login_events add constraint customer_login_events_device_details_size
  check (device_details is null or (jsonb_typeof(device_details) = 'object' and octet_length(device_details::text) <= 2048));
comment on column public.customer_login_events.browser_id is 'Random signed first-party browser-cookie identifier. Resettable; not IMEI, serial number, authentication or proof of identity.';
comment on column public.customer_login_events.device_details is 'Unverified browser-reported device hints. No hardware identifiers. Historical null values are intentional.';

create or replace function public.customer_report_device_history(p_customer_id uuid)
returns table(id uuid,created_at timestamptz,browser_id uuid,device_details jsonb)
language sql stable security definer set search_path=''
as $$
 select e.id,e.created_at,e.browser_id,e.device_details
 from public.customer_login_events e where e.user_id=p_customer_id;
$$;
revoke all on function public.customer_report_device_history(uuid) from public,anon,authenticated;
grant execute on function public.customer_report_device_history(uuid) to service_role;
-- Keep the same append-only, service-only policy as login/IP history.
revoke all on public.customer_login_events from public,anon,authenticated;
grant select,insert on public.customer_login_events to service_role;
notify pgrst,'reload schema';
commit;
