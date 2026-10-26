begin;

-- Append-only application sign-in observations. Client roles have no access.
create table if not exists public.customer_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  ip_address inet,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region text check (length(region) <= 120),
  city text check (length(city) <= 120),
  user_agent text check (length(user_agent) <= 600),
  event_type text not null check (event_type in ('PASSWORD_SIGN_IN','EMAIL_VERIFICATION','AUTH_CALLBACK','SESSION_OBSERVED'))
);
create index if not exists customer_login_events_user_time_idx on public.customer_login_events(user_id,created_at,id);
alter table public.customer_login_events enable row level security;
revoke all on public.customer_login_events from public, anon, authenticated;
grant select, insert on public.customer_login_events to service_role;

-- Return only report-safe fields for one customer; never return tokens or full auth payloads.
-- Does not expose the auth schema or modify managed auth tables.
create or replace function public.customer_report_login_history(p_customer_id uuid,p_source text)
returns table(id uuid,created_at timestamptz,ip_address text,country_code text,region text,city text,user_agent text,event_type text)
language plpgsql stable security definer set search_path='' set timezone='UTC'
as $$
begin
 if p_customer_id is null then raise exception 'Customer is required'; end if;
 if p_source='WEBSITE' then
  return query select e.id,e.created_at,host(e.ip_address),e.country_code,e.region,e.city,e.user_agent,e.event_type
  from public.customer_login_events e where e.user_id=p_customer_id;
 elsif p_source='AUTH_AUDIT' then
  return query select a.id,a.created_at,nullif(btrim(a.ip_address),''),null::text,null::text,null::text,
   left(coalesce(a.payload->>'user_agent',a.payload->'traits'->>'user_agent'),600),
   left(coalesce(a.payload->>'action','auth_event'),100)
  from auth.audit_log_entries a
  where a.payload->>'actor_id'=p_customer_id::text and a.created_at is not null
   and a.payload->>'action' in ('login','user_signedup','token_refreshed','logout','mfa_code_login','invite_accepted');
 elsif p_source='AUTH_SESSION' then
  -- Auth session IPs are updated on refresh: these are retained snapshots, not a complete historical event stream.
  return query select s.id,coalesce(s.refreshed_at::timestamptz,s.created_at),s.ip::text,
   null::text,null::text,null::text,left(s.user_agent,600),'SESSION_SNAPSHOT'::text
  from auth.sessions s where s.user_id=p_customer_id and s.created_at is not null;
 else raise exception 'Invalid login history source';
 end if;
end;
$$;
revoke all on function public.customer_report_login_history(uuid,text) from public,anon,authenticated;
grant execute on function public.customer_report_login_history(uuid,text) to service_role;
comment on function public.customer_report_login_history(uuid,text) is 'Service-only customer report: retained website sign-in observations, auth audit events and current session snapshots. No tokens.';
notify pgrst,'reload schema';
commit;
