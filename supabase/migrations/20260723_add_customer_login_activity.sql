create table if not exists public.customer_login_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_country_code text,
  previous_country_code text,
  current_login_at timestamptz,
  previous_login_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_login_current_country_code_check
    check (
      current_country_code is null
      or current_country_code ~ '^[A-Z]{2}$'
    ),
  constraint customer_login_previous_country_code_check
    check (
      previous_country_code is null
      or previous_country_code ~ '^[A-Z]{2}$'
    )
);

alter table public.customer_login_activity enable row level security;

revoke all on table public.customer_login_activity from anon, authenticated;
