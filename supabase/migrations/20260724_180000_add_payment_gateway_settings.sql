create table if not exists public.payment_gateway_settings (
  id boolean primary key default true check (id = true),
  pally_usd_rub_rate numeric(12, 4) not null default 85
    check (pally_usd_rub_rate >= 1 and pally_usd_rub_rate <= 1000),
  updated_at timestamptz not null default now()
);

insert into public.payment_gateway_settings (id, pally_usd_rub_rate)
values (true, 85)
on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.payment_gateway_settings;
create trigger set_updated_at
before update on public.payment_gateway_settings
for each row execute function public.set_updated_at();

alter table public.payment_gateway_settings enable row level security;

revoke all on public.payment_gateway_settings from anon, authenticated;
grant all on public.payment_gateway_settings to service_role;
