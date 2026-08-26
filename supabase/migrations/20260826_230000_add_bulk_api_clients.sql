begin;

create table if not exists public.bulk_api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  contact_email text,
  key_prefix text not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.bulk_api_requests
  add column if not exists client_id uuid references public.bulk_api_clients(id) on delete set null;

alter table public.bulk_api_requests
  drop constraint if exists bulk_api_requests_idempotency_key_key;

create unique index if not exists bulk_api_requests_client_idempotency_idx
  on public.bulk_api_requests (coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key);

create index if not exists bulk_api_requests_client_created_idx
  on public.bulk_api_requests (client_id, created_at desc);

alter table public.bulk_api_clients enable row level security;
revoke all on table public.bulk_api_clients from public, anon, authenticated;
grant select, insert, update on table public.bulk_api_clients to service_role;

comment on table public.bulk_api_clients is
  'Private partner credentials for the manual-delivery Bulk API. Only SHA-256 key hashes are stored.';

commit;
