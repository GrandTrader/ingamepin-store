begin;

create extension if not exists pgcrypto;

alter table public.products
  add column if not exists affiliate_enabled boolean not null default false,
  add column if not exists affiliate_commission_percent numeric(5,2) not null default 0,
  add column if not exists affiliate_updated_at timestamptz;

alter table public.products
  drop constraint if exists products_affiliate_commission_percent_check;

alter table public.products
  add constraint products_affiliate_commission_percent_check
  check (affiliate_commission_percent between 0 and 25);

create table if not exists public.affiliate_settings (
  id smallint primary key default 1 check (id = 1),
  program_enabled boolean not null default false,
  minimum_payout numeric(12,2) not null default 25 check (minimum_payout > 0),
  holding_days integer not null default 7 check (holding_days between 0 and 90),
  payout_currency text not null default 'USDT' check (payout_currency = 'USDT'),
  payout_networks text[] not null default array['TRC20', 'BEP20', 'SOLANA']::text[],
  cookie_days integer not null default 30 check (cookie_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.affiliate_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  affiliate_code text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  promotion_channel text not null
    check (promotion_channel in ('WEBSITE', 'YOUTUBE', 'TELEGRAM', 'SOCIAL_MEDIA', 'OTHER')),
  promotion_url text,
  promotion_plan text not null check (char_length(btrim(promotion_plan)) between 20 and 2000),
  payout_network text not null default 'TRC20'
    check (payout_network in ('TRC20', 'BEP20', 'SOLANA')),
  payout_address text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_accounts_status_created_idx
  on public.affiliate_accounts(status, created_at desc);

create or replace function public.submit_affiliate_application(
  p_full_name text,
  p_country_code text,
  p_promotion_channel text,
  p_promotion_url text,
  p_promotion_plan text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_affiliate_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  p_full_name := btrim(coalesce(p_full_name, ''));
  p_country_code := upper(btrim(coalesce(p_country_code, '')));
  p_promotion_channel := upper(btrim(coalesce(p_promotion_channel, '')));
  p_promotion_url := nullif(btrim(coalesce(p_promotion_url, '')), '');
  p_promotion_plan := btrim(coalesce(p_promotion_plan, ''));

  if char_length(p_full_name) < 2 or char_length(p_full_name) > 120 then
    raise exception 'Enter a valid full name.';
  end if;

  if p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Select a valid country.';
  end if;

  if p_promotion_channel not in (
    'WEBSITE', 'YOUTUBE', 'TELEGRAM', 'SOCIAL_MEDIA', 'OTHER'
  ) then
    raise exception 'Select a valid promotion channel.';
  end if;

  if p_promotion_url is not null and char_length(p_promotion_url) > 500 then
    raise exception 'Promotion URL is too long.';
  end if;

  if char_length(p_promotion_plan) < 20 or char_length(p_promotion_plan) > 2000 then
    raise exception 'Promotion plan must contain between 20 and 2,000 characters.';
  end if;

  select id into v_account_id
  from public.affiliate_accounts
  where user_id = v_user_id
  for update;

  if found then
    if exists (
      select 1
      from public.affiliate_accounts
      where id = v_account_id
        and status in ('APPROVED', 'SUSPENDED')
    ) then
      raise exception 'This affiliate account cannot submit another application.';
    end if;

    update public.affiliate_accounts
    set
      status = 'PENDING',
      full_name = p_full_name,
      country_code = p_country_code,
      promotion_channel = p_promotion_channel,
      promotion_url = p_promotion_url,
      promotion_plan = p_promotion_plan,
      rejected_at = null,
      rejection_reason = null,
      updated_at = now()
    where id = v_account_id;

    return v_account_id;
  end if;

  loop
    v_affiliate_code := 'IGP-' || upper(encode(gen_random_bytes(5), 'hex'));
    exit when not exists (
      select 1
      from public.affiliate_accounts
      where affiliate_code = v_affiliate_code
    );
  end loop;

  insert into public.affiliate_accounts (
    user_id,
    affiliate_code,
    full_name,
    country_code,
    promotion_channel,
    promotion_url,
    promotion_plan
  ) values (
    v_user_id,
    v_affiliate_code,
    p_full_name,
    p_country_code,
    p_promotion_channel,
    p_promotion_url,
    p_promotion_plan
  )
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  visitor_token_hash text not null,
  ip_hash text,
  device_hash text,
  landing_path text not null,
  referrer_url text,
  converted_order_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_clicks_affiliate_created_idx
  on public.affiliate_clicks(affiliate_id, created_at desc);
create index if not exists affiliate_clicks_visitor_created_idx
  on public.affiliate_clicks(visitor_token_hash, created_at desc);

alter table public.orders
  add column if not exists affiliate_id uuid references public.affiliate_accounts(id) on delete set null,
  add column if not exists affiliate_click_id uuid references public.affiliate_clicks(id) on delete set null,
  add column if not exists affiliate_markup numeric(12,2) not null default 0
    check (affiliate_markup >= 0);

alter table public.affiliate_clicks
  drop constraint if exists affiliate_clicks_converted_order_id_fkey;

alter table public.affiliate_clicks
  add constraint affiliate_clicks_converted_order_id_fkey
  foreign key (converted_order_id) references public.orders(id) on delete set null;

alter table public.order_items
  add column if not exists affiliate_base_unit_price numeric(12,2),
  add column if not exists affiliate_commission_percent numeric(5,2) not null default 0,
  add column if not exists affiliate_markup_amount numeric(12,2) not null default 0;

alter table public.order_items
  drop constraint if exists order_items_affiliate_commission_percent_check;
alter table public.order_items
  drop constraint if exists order_items_affiliate_markup_amount_check;

alter table public.order_items
  add constraint order_items_affiliate_commission_percent_check
    check (affiliate_commission_percent between 0 and 25),
  add constraint order_items_affiliate_markup_amount_check
    check (affiliate_markup_amount >= 0);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  commission_percent numeric(5,2) not null check (commission_percent between 0 and 25),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  currency text not null default 'USDT' check (currency = 'USDT'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'AVAILABLE', 'HELD', 'REQUESTED', 'PAID', 'REJECTED', 'CANCELLED')),
  available_at timestamptz not null,
  self_referral boolean not null default false,
  risk_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_flags) = 'array'),
  payout_request_id uuid,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id)
);

create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions(affiliate_id, status, available_at);
create index if not exists affiliate_commissions_order_idx
  on public.affiliate_commissions(order_id);

create table if not exists public.affiliate_payout_requests (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USDT' check (currency = 'USDT'),
  network text not null check (network in ('TRC20', 'BEP20', 'SOLANA')),
  wallet_address text not null check (char_length(btrim(wallet_address)) between 20 and 150),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED')),
  transaction_id text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.affiliate_commissions
  drop constraint if exists affiliate_commissions_payout_request_id_fkey;

alter table public.affiliate_commissions
  add constraint affiliate_commissions_payout_request_id_fkey
  foreign key (payout_request_id)
  references public.affiliate_payout_requests(id) on delete set null;

create index if not exists affiliate_payout_requests_affiliate_status_idx
  on public.affiliate_payout_requests(affiliate_id, status, created_at desc);

create or replace function public.release_mature_affiliate_commissions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.affiliate_commissions
  set status = 'AVAILABLE', updated_at = now()
  where status = 'PENDING'
    and self_referral = false
    and available_at <= now();

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.create_affiliate_payout_request(
  p_amount numeric,
  p_network text,
  p_wallet_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affiliate public.affiliate_accounts%rowtype;
  v_settings public.affiliate_settings%rowtype;
  v_available numeric(12,2);
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  perform public.release_mature_affiliate_commissions();

  select * into v_affiliate
  from public.affiliate_accounts
  where user_id = auth.uid()
    and status = 'APPROVED'
  for update;

  if not found then
    raise exception 'An approved affiliate account is required.';
  end if;

  select * into v_settings
  from public.affiliate_settings
  where id = 1;

  if not v_settings.program_enabled then
    raise exception 'Affiliate payouts are currently disabled.';
  end if;

  p_network := upper(btrim(coalesce(p_network, '')));
  p_wallet_address := btrim(coalesce(p_wallet_address, ''));

  if not (p_network = any(v_settings.payout_networks)) then
    raise exception 'The selected payout network is not supported.';
  end if;

  if char_length(p_wallet_address) < 20 or char_length(p_wallet_address) > 150 then
    raise exception 'Enter a valid payout wallet address.';
  end if;

  select coalesce(sum(commission_amount), 0)
  into v_available
  from public.affiliate_commissions
  where affiliate_id = v_affiliate.id
    and status = 'AVAILABLE';

  p_amount := round(coalesce(p_amount, 0), 2);

  if p_amount < v_settings.minimum_payout then
    raise exception 'The minimum payout is % USDT.', v_settings.minimum_payout;
  end if;

  if p_amount > v_available then
    raise exception 'The requested amount exceeds the available balance.';
  end if;

  if p_amount <> round(v_available, 2) then
    raise exception 'Payout requests must use the full available balance.';
  end if;

  insert into public.affiliate_payout_requests (
    affiliate_id, amount, network, wallet_address
  ) values (
    v_affiliate.id, p_amount, p_network, p_wallet_address
  ) returning id into v_request_id;

  with selected as (
    select id
    from public.affiliate_commissions
    where affiliate_id = v_affiliate.id
      and status = 'AVAILABLE'
    order by available_at, created_at, id
    for update
  ), running as (
    select
      id,
      sum(commission_amount) over (order by available_at, created_at, id) as running_total
    from public.affiliate_commissions
    where id in (select id from selected)
  )
  update public.affiliate_commissions commission
  set
    status = 'REQUESTED',
    payout_request_id = v_request_id,
    updated_at = now()
  where commission.id in (
    select id from running
    where running_total <= p_amount
  );

  if (
    select coalesce(sum(commission_amount), 0)
    from public.affiliate_commissions
    where payout_request_id = v_request_id
  ) <> p_amount then
    raise exception 'Choose an amount matching the available commission entries.';
  end if;

  update public.affiliate_accounts
  set
    payout_network = p_network,
    payout_address = p_wallet_address,
    updated_at = now()
  where id = v_affiliate.id;

  return v_request_id;
end;
$$;

create or replace view public.affiliate_balance_summary
with (security_invoker = true)
as
select
  affiliate.id as affiliate_id,
  affiliate.user_id,
  coalesce(sum(commission.commission_amount) filter (where commission.status = 'PENDING'), 0)::numeric(12,2) as pending_balance,
  coalesce(sum(commission.commission_amount) filter (where commission.status = 'AVAILABLE'), 0)::numeric(12,2) as available_balance,
  coalesce(sum(commission.commission_amount) filter (where commission.status = 'REQUESTED'), 0)::numeric(12,2) as requested_balance,
  coalesce(sum(commission.commission_amount) filter (where commission.status = 'PAID'), 0)::numeric(12,2) as paid_total
from public.affiliate_accounts affiliate
left join public.affiliate_commissions commission
  on commission.affiliate_id = affiliate.id
group by affiliate.id, affiliate.user_id;

alter table public.affiliate_settings enable row level security;
alter table public.affiliate_accounts enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_payout_requests enable row level security;

revoke all on table public.affiliate_settings from anon, authenticated;
revoke all on table public.affiliate_accounts from anon, authenticated;
revoke all on table public.affiliate_clicks from anon, authenticated;
revoke all on table public.affiliate_commissions from anon, authenticated;
revoke all on table public.affiliate_payout_requests from anon, authenticated;

grant select on table public.affiliate_settings to authenticated;
grant select on table public.affiliate_accounts to authenticated;
grant select on table public.affiliate_commissions to authenticated;
grant select on table public.affiliate_payout_requests to authenticated;
grant select on table public.affiliate_balance_summary to authenticated;

drop policy if exists "Affiliate reads program settings" on public.affiliate_settings;
create policy "Affiliate reads program settings"
  on public.affiliate_settings for select to authenticated
  using (true);

drop policy if exists "Users read own affiliate account" on public.affiliate_accounts;
create policy "Users read own affiliate account"
  on public.affiliate_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Affiliates read own commissions" on public.affiliate_commissions;
create policy "Affiliates read own commissions"
  on public.affiliate_commissions for select to authenticated
  using (
    affiliate_id in (
      select id from public.affiliate_accounts where user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "Affiliates read own payout requests" on public.affiliate_payout_requests;
create policy "Affiliates read own payout requests"
  on public.affiliate_payout_requests for select to authenticated
  using (
    affiliate_id in (
      select id from public.affiliate_accounts where user_id = auth.uid()
    )
    or public.is_admin()
  );

revoke all on function public.release_mature_affiliate_commissions() from public;
grant execute on function public.release_mature_affiliate_commissions() to service_role;

revoke all on function public.submit_affiliate_application(text, text, text, text, text) from public;
grant execute on function public.submit_affiliate_application(text, text, text, text, text) to authenticated;

revoke all on function public.create_affiliate_payout_request(numeric, text, text) from public;
grant execute on function public.create_affiliate_payout_request(numeric, text, text) to authenticated;

comment on column public.products.affiliate_commission_percent is
  'Product-specific affiliate percentage. The storefront also uses this percentage as the affiliate-link price markup.';
comment on table public.affiliate_commissions is
  'Immutable product-level commission snapshots. Self-purchases are rejected from commission earnings.';

commit;
