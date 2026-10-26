begin;

-- Purchase restrictions deliberately do not revoke sign-in, receipts, support,
-- payment evidence, or the processing of already-confirmed payments.
-- Keep restrictions/audit after account deletion so recreating its email is not a bypass.
create table if not exists public.customer_purchase_restrictions (
  customer_id uuid primary key,
  enabled boolean not null default false,
  block_devices boolean not null default true,
  block_ips boolean not null default false,
  reason text not null check (length(reason) between 1 and 1000),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.customer_purchase_restriction_keys (
  customer_id uuid not null references public.customer_purchase_restrictions(customer_id) on delete cascade,
  kind text not null check (kind in ('EMAIL','BROWSER','IP')),
  value text not null check (length(value) between 1 and 320),
  created_at timestamptz not null default now(),
  primary key(customer_id,kind,value)
);
create index if not exists customer_purchase_keys_lookup on public.customer_purchase_restriction_keys(kind,value,customer_id);
-- One recent observation per account/browser or account/IP, including checkout sessions.
create table if not exists public.customer_purchase_observations (
  customer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('BROWSER','IP')),
  value text not null check (length(value) between 1 and 100),
  seen_at timestamptz not null default now(),
  primary key(customer_id,kind,value)
);
create table if not exists public.customer_purchase_restriction_audit (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  admin_id uuid not null,
  created_at timestamptz not null default now(),
  enabled boolean not null,
  block_devices boolean not null,
  block_ips boolean not null,
  reason text not null
);
alter table public.customer_purchase_observations enable row level security;
revoke all on public.customer_purchase_observations from public,anon,authenticated,service_role;
grant select on public.customer_purchase_observations to service_role;
alter table public.customer_purchase_restrictions enable row level security;
alter table public.customer_purchase_restriction_keys enable row level security;
alter table public.customer_purchase_restriction_audit enable row level security;
revoke all on public.customer_purchase_restrictions,public.customer_purchase_restriction_keys,public.customer_purchase_restriction_audit from public,anon,authenticated,service_role;
grant select on public.customer_purchase_restrictions,public.customer_purchase_restriction_keys,public.customer_purchase_restriction_audit to service_role;

-- Called only with server-verified identities, signed browser cookies and trusted edge IPs.
create or replace function public.customer_purchase_access(
  p_user uuid default null,p_email text default null,p_browser uuid default null,p_ip text default null,p_bulk_client uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=p_user; account_email text; ip text;
begin
  if p_bulk_client is not null then
    select u.id into actor from public.bulk_api_clients c join auth.users u on lower(u.email)=lower(c.contact_email)
      where c.id=p_bulk_client and c.status='ACTIVE' and u.email_confirmed_at is not null;
    if actor is null then raise exception 'Approved business account required.'; end if;
  end if;
  select lower(btrim(email)) into account_email from auth.users where id=actor;
  ip:=host(nullif(btrim(p_ip),'')::inet);
  if account_email is not null then
    delete from public.customer_purchase_observations where customer_id=actor and seen_at<now()-interval '180 days';
    insert into public.customer_purchase_observations(customer_id,kind,value)
      select actor,k.kind,k.value from (values ('BROWSER',p_browser::text),('IP',ip)) k(kind,value) where k.value is not null
      on conflict(customer_id,kind,value) do update set seen_at=now();
  end if;
  -- Remember a restricted account's newly observed browser/IP without blocking login.
  insert into public.customer_purchase_restriction_keys(customer_id,kind,value)
    select r.customer_id,k.kind,k.value from public.customer_purchase_restrictions r
    cross join lateral (values ('EMAIL',account_email),('BROWSER',p_browser::text),('IP',ip)) k(kind,value)
    where r.customer_id=actor and r.enabled and k.value is not null and k.value<>''
      and (k.kind='EMAIL' or (k.kind='BROWSER' and r.block_devices) or (k.kind='IP' and r.block_ips))
    on conflict do nothing;
  return not exists (
    select 1 from public.customer_purchase_restrictions r where r.enabled and (
      r.customer_id=actor or exists (
        select 1 from public.customer_purchase_restriction_keys k where k.customer_id=r.customer_id and (
          (k.kind='EMAIL' and k.value in (lower(btrim(p_email)),account_email)) or
          (k.kind='BROWSER' and r.block_devices and k.value=p_browser::text) or
          (k.kind='IP' and r.block_ips and k.value=ip)
        )
      )
    )
  );
end $$;

create or replace function public.set_customer_purchase_restriction(
  p_admin uuid,p_customer uuid,p_enabled boolean,p_devices boolean,p_ips boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare customer_email text;
begin
  if not exists(select 1 from public.admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  if p_admin=p_customer or exists(select 1 from public.admin_users where user_id=p_customer) then raise exception 'Administrator accounts cannot be restricted here.'; end if;
  select lower(btrim(email)) into customer_email from auth.users where id=p_customer;
  if customer_email is null then raise exception 'Customer not found.'; end if;
  if p_enabled is null or p_devices is null or p_ips is null or coalesce(length(btrim(p_reason)),0) not between 1 and 1000 then raise exception 'Enter an internal reason (up to 1000 characters).'; end if;
  insert into public.customer_purchase_restrictions(customer_id,enabled,block_devices,block_ips,reason,updated_by)
    values(p_customer,p_enabled,p_devices,p_ips,btrim(p_reason),p_admin)
    on conflict(customer_id) do update set enabled=excluded.enabled,block_devices=excluded.block_devices,
      block_ips=excluded.block_ips,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
  if p_enabled then
    insert into public.customer_purchase_restriction_keys(customer_id,kind,value) values(p_customer,'EMAIL',customer_email) on conflict do nothing;
    insert into public.customer_purchase_restriction_keys(customer_id,kind,value)
      select p_customer,kind,value from public.customer_purchase_observations where customer_id=p_customer and seen_at>=now()-interval '180 days'
        and ((kind='BROWSER' and p_devices) or (kind='IP' and p_ips)) on conflict do nothing;
    insert into public.customer_purchase_restriction_keys(customer_id,kind,value)
      select distinct p_customer,k.kind,k.value from public.customer_login_events e
      cross join lateral (values ('BROWSER',e.browser_id::text),('IP',host(e.ip_address))) k(kind,value)
      where e.user_id=p_customer and e.created_at>=now()-interval '180 days' and k.value is not null
        and ((k.kind='BROWSER' and p_devices) or (k.kind='IP' and p_ips)) on conflict do nothing;
  end if;
  insert into public.customer_purchase_restriction_audit(customer_id,admin_id,enabled,block_devices,block_ips,reason)
    values(p_customer,p_admin,p_enabled,p_devices,p_ips,btrim(p_reason));
end $$;

create or replace function public.customer_purchase_restriction_state(p_customer uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'enabled',coalesce(r.enabled,false),'blockDevices',coalesce(r.block_devices,true),'blockIps',coalesce(r.block_ips,false),
    'reason',coalesce(r.reason,''),'updatedAt',r.updated_at,
    'protected',exists(select 1 from public.admin_users where user_id=p_customer),
    'devices',(select count(*) from (
      select browser_id::text from public.customer_login_events where user_id=p_customer and browser_id is not null and created_at>=now()-interval '180 days'
      union select value from public.customer_purchase_observations where customer_id=p_customer and kind='BROWSER' and seen_at>=now()-interval '180 days'
      union select value from public.customer_purchase_restriction_keys where customer_id=p_customer and kind='BROWSER') d),
    'ips',(select count(*) from (
      select host(ip_address) from public.customer_login_events where user_id=p_customer and ip_address is not null and created_at>=now()-interval '180 days'
      union select value from public.customer_purchase_observations where customer_id=p_customer and kind='IP' and seen_at>=now()-interval '180 days'
      union select value from public.customer_purchase_restriction_keys where customer_id=p_customer and kind='IP') i)
  ) from (select p_customer as id) c left join public.customer_purchase_restrictions r on r.customer_id=c.id
$$;

create or replace function public.observe_restricted_customer_login()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.customer_purchase_access(new.user_id,null,new.browser_id,host(new.ip_address));
  return new;
end $$;
drop trigger if exists customer_purchase_login_observed on public.customer_login_events;
create trigger customer_purchase_login_observed after insert on public.customer_login_events for each row execute function public.observe_restricted_customer_login();

-- Account/email protection also covers old service order-creation entry points.
create or replace function public.guard_customer_purchase_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not public.customer_purchase_access(
    coalesce(nullif(current_setting('app.business_buyer',true),'')::uuid,new.customer_id),new.customer_email,
    nullif(current_setting('app.purchase_browser',true),'')::uuid,
    coalesce(nullif(current_setting('app.purchase_ip',true),''),host(new.customer_ip))) then
    raise exception 'New purchases are restricted. Please contact support. You can still view previous orders.';
  end if;
  return new;
end $$;
drop trigger if exists customer_purchase_order_guard on public.orders;
create trigger customer_purchase_order_guard before insert on public.orders for each row execute function public.guard_customer_purchase_order();

create or replace function public.create_customer_checked_order(
  p_customer_name text,p_customer_email text,p_customer_phone text,p_payment_method text,p_items jsonb,
  p_customer_note text default null,p_user uuid default null,p_bulk_client uuid default null,
  p_ip text default null,p_browser uuid default null,p_denomination_guard boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.customer_purchase_access(p_user,p_customer_email,p_browser,p_ip,p_bulk_client) then
    raise exception 'New purchases are restricted. Please contact support. You can still view previous orders.';
  end if;
  perform set_config('app.purchase_browser',coalesce(p_browser::text,''),true);
  perform set_config('app.purchase_ip',coalesce(p_ip,''),true);
  if p_denomination_guard then
    result:=public.create_purchase_checked_order(p_customer_name,p_customer_email,p_customer_phone,p_payment_method,p_items,p_customer_note,p_user,p_bulk_client,p_ip);
  else
    result:=public.create_business_checked_order(p_customer_name,p_customer_email,p_customer_phone,p_payment_method,p_items,p_customer_note,p_user,p_bulk_client);
  end if;
  -- Bind all authenticated checkouts, including unrestricted products and non-wallet payments.
  update public.orders set customer_id=coalesce(nullif(current_setting('app.business_buyer',true),'')::uuid,customer_id)
    where id=(result->>'id')::uuid;
  return result;
end $$;

create or replace function public.customer_checked_portal_checkout(
  p_user uuid,p_request uuid,p_action text,p_items jsonb,p_reference text,p_expected numeric,p_ip text,p_browser uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb;
begin
  -- Recovery of a committed order remains available and must never charge twice.
  replay:=public.portal_wallet_checkout(p_user,p_request,'recover',p_items,p_reference,p_expected,p_ip);
  if replay is not null or p_action='recover' then return replay; end if;
  if not public.customer_purchase_access(p_user,null,p_browser,p_ip) then
    raise exception 'New purchases are restricted. Please contact support. You can still view previous orders.';
  end if;
  perform set_config('app.purchase_browser',coalesce(p_browser::text,''),true);
  perform set_config('app.purchase_ip',coalesce(p_ip,''),true);
  return public.portal_wallet_checkout(p_user,p_request,p_action,p_items,p_reference,p_expected,p_ip);
end $$;

-- Check existing unpaid orders when starting/revising payment, never in callbacks.
-- Preserve the existing expiry/locking implementation and fail on an unexpected schema.
do $$
declare definition text; anchor text:='begin';
begin
  definition:=pg_get_functiondef('public.assert_checkout_open(uuid)'::regprocedure);
  if position('customer-purchase-access-v1' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Unexpected checkout validation function'; end if;
    definition:=replace(definition,anchor,E'begin\n  -- customer-purchase-access-v1\n  if exists(select 1 from public.orders purchase_order where purchase_order.id=p_order_id and purchase_order.paid_at is null and not public.customer_purchase_access(purchase_order.customer_id,purchase_order.customer_email,null,null)) then\n    raise exception ''New purchases are restricted. Please contact support. You can still view previous orders.'';\n  end if;');
    execute definition;
  end if;
end $$;

revoke all on function public.customer_purchase_access(uuid,text,uuid,text,uuid),public.set_customer_purchase_restriction(uuid,uuid,boolean,boolean,boolean,text),
  public.customer_purchase_restriction_state(uuid),public.observe_restricted_customer_login(),public.guard_customer_purchase_order(),
  public.create_customer_checked_order(text,text,text,text,jsonb,text,uuid,uuid,text,uuid,boolean),
  public.customer_checked_portal_checkout(uuid,uuid,text,jsonb,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.customer_purchase_access(uuid,text,uuid,text,uuid),public.set_customer_purchase_restriction(uuid,uuid,boolean,boolean,boolean,text),
  public.customer_purchase_restriction_state(uuid),public.create_customer_checked_order(text,text,text,text,jsonb,text,uuid,uuid,text,uuid,boolean),
  public.customer_checked_portal_checkout(uuid,uuid,text,jsonb,text,numeric,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
