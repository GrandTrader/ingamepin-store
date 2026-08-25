create table if not exists public.marketing_email_subscriptions (
  email text primary key,
  user_id uuid references auth.users(id) on delete set null,
  subscribed boolean not null default false,
  consent_source text not null default 'registration',
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_email_subscriptions_email_normalized
    check (email = lower(trim(email)))
);

create index if not exists marketing_email_subscriptions_subscribed_idx
  on public.marketing_email_subscriptions (subscribed, updated_at desc);

alter table public.marketing_email_subscriptions enable row level security;

revoke all on table public.marketing_email_subscriptions from anon, authenticated;
