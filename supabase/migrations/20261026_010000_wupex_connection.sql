-- Private supplier connection; this update does not import products or create orders.
begin;
create table if not exists public.wupex_settings (
  id boolean primary key default true check (id),
  credentials_ciphertext text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.wupex_settings enable row level security;
revoke all on public.wupex_settings from public, anon, authenticated;
grant select, insert, update on public.wupex_settings to service_role;
notify pgrst, 'reload schema';
commit;
