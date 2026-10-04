-- Guest purchase verification is separate from account authentication.
-- Only server-side service-role code can use these tables and functions.
create table public.security_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  hits integer not null,
  expires_at timestamptz not null
);
create index security_rate_limits_expiry on public.security_rate_limits(expires_at);
create table public.guest_purchase_challenges (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  email text not null check (length(email) between 5 and 254),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index guest_purchase_challenges_expiry on public.guest_purchase_challenges(expires_at);
create table public.guest_purchase_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  email text not null,
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index guest_purchase_sessions_expiry on public.guest_purchase_sessions(expires_at);

alter table public.security_rate_limits enable row level security;
alter table public.guest_purchase_challenges enable row level security;
alter table public.guest_purchase_sessions enable row level security;
revoke all on public.security_rate_limits, public.guest_purchase_challenges, public.guest_purchase_sessions from public, anon, authenticated;
grant all on public.security_rate_limits, public.guest_purchase_challenges, public.guest_purchase_sessions to service_role;

create function public.consume_security_rate(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare accepted integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 10000 or p_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit';
  end if;
  delete from public.security_rate_limits where expires_at < now() - interval '1 day';
  insert into public.security_rate_limits(key_hash,hits,expires_at)
  values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key_hash) do update set
    hits=case when security_rate_limits.expires_at <= now() then 1 else security_rate_limits.hits+1 end,
    expires_at=case when security_rate_limits.expires_at <= now() then now()+make_interval(secs=>p_seconds) else security_rate_limits.expires_at end
  where security_rate_limits.expires_at <= now() or security_rate_limits.hits < p_limit
  returning hits into accepted;
  return accepted is not null;
end;
$$;

create function public.verify_guest_purchase_otp(p_challenge text, p_code text, p_session text)
returns text language plpgsql security definer set search_path = public as $$
declare challenge public.guest_purchase_challenges%rowtype;
begin
  if p_challenge !~ '^[a-f0-9]{64}$' or p_code !~ '^[a-f0-9]{64}$' or p_session !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into challenge from public.guest_purchase_challenges where token_hash=p_challenge for update;
  if not found then return null; end if;
  if challenge.expires_at <= now() or challenge.attempts >= 5 then return null; end if;
  if challenge.code_hash <> p_code then
    -- Return rather than raise: a failed guess must commit its attempt counter.
    update public.guest_purchase_challenges set attempts=attempts+1 where token_hash=p_challenge;
    return null;
  end if;
  insert into public.guest_purchase_sessions(token_hash,email) values(p_session,challenge.email);
  delete from public.guest_purchase_challenges where token_hash=p_challenge;
  return challenge.email;
end;
$$;
revoke all on function public.consume_security_rate(text,integer,integer), public.verify_guest_purchase_otp(text,text,text) from public, anon, authenticated;
grant execute on function public.consume_security_rate(text,integer,integer), public.verify_guest_purchase_otp(text,text,text) to service_role;
