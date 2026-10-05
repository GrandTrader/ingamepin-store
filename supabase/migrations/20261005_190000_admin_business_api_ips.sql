begin;

-- Existing customer-entered IPs are intentionally not treated as admin approval.
create table if not exists public.business_api_ip_approvals (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ips inet[] not null default '{}' check(cardinality(ips) between 0 and 20),
 revision integer not null default 1,
 approved_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.business_api_ip_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id),old_ips inet[] not null,new_ips inet[] not null,
 created_at timestamptz not null default now()
);
alter table public.business_api_ip_approvals enable row level security;
alter table public.business_api_ip_events enable row level security;
revoke all on public.business_api_ip_approvals,public.business_api_ip_events from public,anon,authenticated;
grant select on public.business_api_ip_approvals,public.business_api_ip_events to service_role;

create or replace function public.approve_business_api_ips(p_admin uuid,p_user uuid,p_ips inet[],p_revision integer,p_static_verified boolean)
returns void language plpgsql security definer set search_path=public as $$
declare previous public.business_api_ip_approvals; normalized inet[];
begin
 if not exists(select 1 from public.admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business-api-ip-approval:'||p_user::text,0));
 if not exists(select 1 from public.business_kyb where user_id=p_user) then raise exception 'Business account not found.'; end if;
 if p_ips is null or cardinality(p_ips)>20 then raise exception 'Use up to 20 individual IP addresses.'; end if;
 if exists(select 1 from unnest(p_ips) ip where ip is null or masklen(ip)<>case family(ip) when 4 then 32 else 128 end) then raise exception 'Use individual IP addresses, not network ranges.'; end if;
 select coalesce(array_agg(distinct ip order by ip),'{}'::inet[]) into normalized from unnest(p_ips) ip;
 if cardinality(normalized)>0 then
   if p_static_verified is distinct from true then raise exception 'Confirm the server IP addresses are static.'; end if;
   perform require_approved_business(p_user);
 end if;
 select * into previous from public.business_api_ip_approvals where user_id=p_user for update;
 if p_revision is null or p_revision<>coalesce(previous.revision,0) then raise exception 'IP approvals changed. Refresh this page before saving.'; end if;
 insert into public.business_api_ip_approvals(user_id,ips,approved_by,revision) values(p_user,normalized,p_admin,1)
 on conflict(user_id) do update set ips=excluded.ips,approved_by=excluded.approved_by,updated_at=now(),revision=business_api_ip_approvals.revision+1;
 insert into public.business_api_ip_events(user_id,actor_id,old_ips,new_ips) values(p_user,p_admin,coalesce(previous.ips,'{}'::inet[]),normalized);
end $$;
revoke all on function public.approve_business_api_ips(uuid,uuid,inet[],integer,boolean) from public,anon,authenticated;
grant execute on function public.approve_business_api_ips(uuid,uuid,inet[],integer,boolean) to service_role;

create or replace function public.create_business_api_key(p_user uuid,p_name text,p_hash text,p_prefix text,p_ips inet[],p_write boolean,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; approved inet[];
begin
 perform require_approved_business(p_user);
 select ips into approved from public.business_api_ip_approvals where user_id=p_user;
 if coalesce(cardinality(approved),0)=0 then raise exception 'Ask an administrator to approve your server IP before creating an API key.'; end if;
 if p_ips is null or cardinality(p_ips)<>1 or p_ips[1] is null or not(p_ips[1]=any(approved)) then raise exception 'Select one admin-approved static IP for this key.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business-api-keys:'||p_user::text,0));
 if (select count(*) from business_api_keys where user_id=p_user and revoked_at is null and expires_at>now())>=10 then
  raise exception 'Revoke an existing key before creating another (maximum 10 active keys).';
 end if;
 if p_expires<=now() or p_expires>now()+interval '366 days' then raise exception 'Invalid expiry date.'; end if;
 if exists(select 1 from unnest(p_ips) ip where ip is null or masklen(ip)<>case family(ip) when 4 then 32 else 128 end) then
  raise exception 'Use individual IP addresses, not network ranges.';
 end if;
 insert into business_api_keys(user_id,name,key_hash,key_prefix,allowed_ips,can_order,expires_at)
 values(p_user,p_name,p_hash,p_prefix,p_ips,p_write,p_expires) returning id into result;
 return result;
end $$;

create or replace function public.authorize_business_api(p_hash text,p_ip inet)
returns jsonb language plpgsql security definer set search_path=public as $$
declare k business_api_keys%rowtype; win timestamptz:=date_trunc('minute',now());
begin
 select * into k from business_api_keys where key_hash=p_hash for update;
 if not found or k.revoked_at is not null or k.expires_at<=now() or p_ip is null or cardinality(k.allowed_ips)<>1 or not(p_ip=any(k.allowed_ips)) then return null; end if;
 if not exists(select 1 from public.business_api_ip_approvals a where a.user_id=k.user_id and p_ip=any(a.ips)) then return null; end if;
 if not exists(select 1 from auth.users u join business_kyb b on b.user_id=u.id
   where u.id=k.user_id and u.email_confirmed_at is not null and b.status='APPROVED'
   and (u.banned_until is null or u.banned_until<now())) then return null; end if;
 if k.rate_window=win and k.rate_count>=120 then raise exception 'business_api_rate_limit'; end if;
 update business_api_keys set last_used_at=now(),last_ip=p_ip,rate_window=win,
  rate_count=case when rate_window=win then rate_count+1 else 1 end where id=k.id;
 return jsonb_build_object('userId',k.user_id,'keyId',k.id,'canOrder',k.can_order);
end $$;

commit;
