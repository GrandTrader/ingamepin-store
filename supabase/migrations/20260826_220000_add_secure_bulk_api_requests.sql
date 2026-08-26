begin;

create table if not exists public.bulk_api_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 120),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid unique references public.orders(id) on delete set null,
  status text not null default 'CREATING',
  response_body jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulk_api_requests_created_at_idx
  on public.bulk_api_requests (created_at desc);

alter table public.bulk_api_requests enable row level security;
revoke all on table public.bulk_api_requests from public, anon, authenticated;
grant select, insert, update on table public.bulk_api_requests to service_role;

comment on table public.bulk_api_requests is
  'Private idempotency and audit records for manual-delivery Bulk API orders.';

commit;
