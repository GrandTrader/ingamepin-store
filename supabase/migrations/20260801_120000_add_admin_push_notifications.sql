create table if not exists public.admin_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_push_events (
  event_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_events enable row level security;

revoke all on public.admin_push_subscriptions from anon, authenticated;
revoke all on public.admin_push_events from anon, authenticated;

