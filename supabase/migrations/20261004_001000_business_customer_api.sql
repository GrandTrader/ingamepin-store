begin;

create table if not exists public.business_api_keys (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 2 and 80),
 key_hash text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
 key_prefix text not null,
 allowed_ips inet[] not null check (cardinality(allowed_ips) between 1 and 20),
 can_order boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 last_used_at timestamptz,
 last_ip inet,
 rate_window timestamptz not null default now(),
 rate_count integer not null default 0
);
create index if not exists business_api_keys_owner on public.business_api_keys(user_id);
alter table public.business_api_keys enable row level security;
revoke all on public.business_api_keys from public, anon, authenticated;
grant select, insert, update on public.business_api_keys to service_role;

create or replace function public.create_business_api_key(p_user uuid,p_name text,p_hash text,p_prefix text,p_ips inet[],p_write boolean,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 perform require_approved_business(p_user);
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
 if not found or k.revoked_at is not null or k.expires_at<=now() or p_ip is null or not (p_ip=any(k.allowed_ips)) then return null; end if;
 if not exists(select 1 from auth.users u join business_kyb b on b.user_id=u.id
   where u.id=k.user_id and u.email_confirmed_at is not null and b.status='APPROVED'
   and (u.banned_until is null or u.banned_until<now())) then return null; end if;
 if k.rate_window=win and k.rate_count>=120 then raise exception 'business_api_rate_limit'; end if;
 update business_api_keys set last_used_at=now(),last_ip=p_ip,rate_window=win,
  rate_count=case when rate_window=win then rate_count+1 else 1 end where id=k.id;
 return jsonb_build_object('userId',k.user_id,'keyId',k.id,'canOrder',k.can_order);
end $$;

revoke all on function public.create_business_api_key(uuid,text,text,text,inet[],boolean,timestamptz) from public,anon,authenticated;
revoke all on function public.authorize_business_api(text,inet) from public,anon,authenticated;
grant execute on function public.create_business_api_key(uuid,text,text,text,inet[],boolean,timestamptz) to service_role;
grant execute on function public.authorize_business_api(text,inet) to service_role;
commit;
