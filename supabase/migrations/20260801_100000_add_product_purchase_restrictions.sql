create table if not exists public.product_purchase_restrictions (
  product_id uuid primary key references public.products(id) on delete cascade,
  is_enabled boolean not null default false,
  weekly_limit numeric(14,2) not null default 25000 check (weekly_limit > 0),
  limit_currency text not null default 'INR' check (limit_currency in ('INR','USD')),
  identity_mode text not null default 'ACCOUNT_EMAIL_IP' check (identity_mode in ('ACCOUNT_EMAIL_IP','ACCOUNT_EMAIL','IP')),
  reset_mode text not null default 'ROLLING_7_DAYS' check (reset_mode in ('ROLLING_7_DAYS','CALENDAR_WEEK')),
  notification_message text not null default 'Weekly purchase limit reached. Please try again after your limit resets.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_ip inet;
create index if not exists orders_customer_ip_idx on public.orders(customer_ip);
alter table public.product_purchase_restrictions enable row level security;
revoke all on public.product_purchase_restrictions from anon, authenticated;
