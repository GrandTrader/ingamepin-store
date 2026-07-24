create table if not exists public.homepage_slider_settings (
  id boolean primary key default true check (id = true),
  is_enabled boolean not null default true,
  autoplay_ms integer not null default 5000 check (autoplay_ms between 2000 and 30000),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_slides (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  eyebrow text not null default '',
  title text not null,
  description text not null default '',
  desktop_image_url text not null,
  mobile_image_url text,
  button_text text not null default 'Shop Now',
  button_url text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

insert into public.homepage_slider_settings (id, is_enabled, autoplay_ms)
values (true, true, 5000)
on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.homepage_slider_settings;
create trigger set_updated_at before update on public.homepage_slider_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.homepage_slides;
create trigger set_updated_at before update on public.homepage_slides
for each row execute function public.set_updated_at();

alter table public.homepage_slider_settings enable row level security;
alter table public.homepage_slides enable row level security;

drop policy if exists "Public reads slider settings" on public.homepage_slider_settings;
create policy "Public reads slider settings" on public.homepage_slider_settings
for select using (true);

drop policy if exists "Public reads active homepage slides" on public.homepage_slides;
create policy "Public reads active homepage slides" on public.homepage_slides
for select using (is_active = true);

create index if not exists homepage_slides_sort_order_idx
on public.homepage_slides (sort_order, created_at);
