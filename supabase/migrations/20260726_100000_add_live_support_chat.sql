create extension if not exists pgcrypto;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  guest_token_hash text,
  customer_name text not null default 'Guest',
  customer_email text,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'CLOSED')),
  last_message_at timestamptz not null default now(),
  customer_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_conversation_identity_check check (
    customer_id is not null or guest_token_hash is not null
  )
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.support_conversations(id) on delete cascade,
  sender_type text not null
    check (sender_type in ('CUSTOMER', 'ADMIN')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null
    check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_customer_id_idx
  on public.support_conversations(customer_id);

create index if not exists support_conversations_status_last_message_idx
  on public.support_conversations(status, last_message_at desc);

create unique index if not exists support_conversations_guest_token_hash_idx
  on public.support_conversations(guest_token_hash)
  where guest_token_hash is not null;

create index if not exists support_messages_conversation_created_idx
  on public.support_messages(conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

revoke all on table public.support_conversations from anon, authenticated;
revoke all on table public.support_messages from anon, authenticated;

grant select on table public.support_conversations to authenticated;
grant select on table public.support_messages to authenticated;

drop policy if exists "Admins read support conversations"
  on public.support_conversations;

create policy "Admins read support conversations"
  on public.support_conversations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins read support messages"
  on public.support_messages;

create policy "Admins read support messages"
  on public.support_messages
  for select
  to authenticated
  using (public.is_admin());

comment on table public.support_conversations is
  'Private live-support conversations. Customer access is mediated by protected server routes.';

comment on table public.support_messages is
  'Private live-support messages. Writes are mediated by protected server routes.';
