-- Private supplier connection and durable admin digital-product purchase ledger.
-- Only authenticated admin server actions use these tables via service_role.
begin;
create table public.fkwallet_settings (
  id boolean primary key default true check (id),
  credentials_ciphertext text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.fkwallet_transactions (
  id uuid primary key,
  reference bigint generated always as identity unique,
  admin_user_id uuid not null references auth.users(id),
  connection_id text not null,
  state text not null default 'READY' check (state in ('READY','SUBMITTING','SUBMITTED','UNKNOWN','CANCELLED')),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  request_ciphertext text not null,
  result_ciphertext text,
  provider_id text,
  provider_status integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  unique(connection_id, provider_id)
);
create index fkwallet_transactions_created on public.fkwallet_transactions(created_at desc);
alter table public.fkwallet_settings enable row level security;
alter table public.fkwallet_transactions enable row level security;
revoke all on public.fkwallet_settings, public.fkwallet_transactions from public, anon, authenticated;
revoke all on sequence public.fkwallet_transactions_reference_seq from public, anon, authenticated;
grant select, insert, update on public.fkwallet_settings, public.fkwallet_transactions to service_role;
grant usage, select on sequence public.fkwallet_transactions_reference_seq to service_role;
commit;
