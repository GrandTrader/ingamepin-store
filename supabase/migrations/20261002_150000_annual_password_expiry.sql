begin;

-- Install first, then enable only after deploying the renewal screen.
create table if not exists public.account_password_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
alter table public.account_password_policy enable row level security;
revoke all on public.account_password_policy from public, anon, authenticated;
insert into public.account_password_policy(id, enabled) values (true, false) on conflict (id) do nothing;

-- Password timestamps are server-owned; never derive them from editable user metadata.
create table if not exists public.account_password_age (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_changed_at timestamptz,
  has_password boolean not null
);
alter table public.account_password_age enable row level security;
revoke all on public.account_password_age from public, anon, authenticated;

-- Existing account creation is a conservative lower bound, not a claim that
-- a password was changed today. Re-running the migration never resets the clock.
insert into public.account_password_age(user_id, password_changed_at, has_password)
select id, case when coalesce(encrypted_password, '') <> '' then created_at else null end,
       coalesce(encrypted_password, '') <> ''
from auth.users on conflict (user_id) do nothing;

create or replace function public.track_account_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.account_password_age(user_id, password_changed_at, has_password)
    values (new.id, case when coalesce(new.encrypted_password, '') <> '' then now() else null end,
            coalesce(new.encrypted_password, '') <> '')
    on conflict (user_id) do nothing;
  elsif new.encrypted_password is distinct from old.encrypted_password then
    insert into public.account_password_age(user_id, password_changed_at, has_password)
    values (new.id, case when coalesce(new.encrypted_password, '') <> '' then now() else null end,
            coalesce(new.encrypted_password, '') <> '')
    on conflict (user_id) do update set password_changed_at = excluded.password_changed_at,
      has_password = excluded.has_password;
  end if;
  return new;
end;
$$;
revoke all on function public.track_account_password_change() from public, anon, authenticated;
drop trigger if exists track_account_password_change on auth.users;
create trigger track_account_password_change after insert or update of encrypted_password on auth.users
for each row execute function public.track_account_password_change();

create or replace function public.account_password_is_current()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.account_password_policy where id and not enabled)
    then auth.uid() is not null else coalesce((select not a.has_password or
    (a.password_changed_at is not null and now() < a.password_changed_at + interval '365 days')
    from public.account_password_age a where a.user_id = auth.uid()), false) end;
$$;
revoke all on function public.account_password_is_current() from public;
grant execute on function public.account_password_is_current() to authenticated, anon, service_role;

create or replace function public.password_expiry_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'required', not public.account_password_is_current(),
    'expires_at', (select case when a.has_password then a.password_changed_at + interval '365 days' else null end
                   from public.account_password_age a where a.user_id = auth.uid()));
$$;
revoke all on function public.password_expiry_status() from public, anon;
grant execute on function public.password_expiry_status() to authenticated;

-- Expired administrators retain only their own membership row for MFA/recovery.
-- Privileged admin RLS policies still require both current password and MFA.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.account_password_is_current()
    and coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
    and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Restrictive policies add a requirement; they never grant new access.
-- Existing RLS tables, realtime reads and private storage operations are covered.
do $$
declare t record;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity
      and ((n.nspname='public' and c.relname not in ('admin_users','account_password_age','account_password_policy'))
        or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('drop policy if exists "Require current account password" on %I.%I',t.nspname,t.relname);
    execute format('create policy "Require current account password" on %I.%I as restrictive for all to authenticated using ((select public.account_password_is_current())) with check ((select public.account_password_is_current()))',t.nspname,t.relname);
  end loop;
end;
$$;

-- Cover direct Data API calls, including SECURITY DEFINER RPCs that bypass RLS.
create or replace function public.enforce_account_password_expiry()
returns void language plpgsql security definer set search_path = '' as $$
declare request_path text := trim(both '/' from coalesce(current_setting('request.path',true),''));
begin
  if auth.role() = 'authenticated' and not public.account_password_is_current() then
    if request_path = 'rpc/password_expiry_status' then return; end if;
    if request_path = 'admin_users' and current_setting('request.method',true) in ('GET','HEAD') then return; end if;
    raise sqlstate 'PT403' using message = 'PASSWORD_EXPIRED', hint = 'Update your password to continue.';
  end if;
end;
$$;
revoke all on function public.enforce_account_password_expiry() from public;
grant execute on function public.enforce_account_password_expiry() to anon, authenticated, service_role;

-- Refuse to overwrite a separately configured pre-request hook.
do $$
declare setting text;
begin
  for setting in select unnest(s.setconfig) from pg_db_role_setting s
    where s.setrole in (0, (select oid from pg_roles where rolname='authenticator'))
  loop
    if setting like 'pgrst.db_pre_request=%'
      and split_part(setting,'=',2) not in ('','public.enforce_account_password_expiry') then
      raise exception 'An existing Data API pre-request hook must be integrated before enabling password expiry.';
    end if;
  end loop;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_account_password_expiry';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
