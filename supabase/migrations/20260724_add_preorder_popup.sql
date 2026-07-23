create table if not exists public.preorder_popup_settings (
  id boolean primary key default true check (id = true),
  is_enabled boolean not null default false,
  product_id uuid references public.products(id) on delete set null,
  game_title text not null default '',
  image_url text not null default '',
  launch_date timestamptz,
  preorder_price numeric(12,2) check (
    preorder_price is null or preorder_price >= 0
  ),
  bonus_text text not null default '',
  button_text text not null default 'PREORDER NOW',
  updated_at timestamptz not null default now()
);

insert into public.preorder_popup_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists set_updated_at
on public.preorder_popup_settings;

create trigger set_updated_at
before update on public.preorder_popup_settings
for each row
execute function public.set_updated_at();

alter table public.preorder_popup_settings
enable row level security;

drop policy if exists "Public reads enabled preorder popup"
on public.preorder_popup_settings;

create policy "Public reads enabled preorder popup"
on public.preorder_popup_settings
for select
using (
  is_enabled = true
  or public.is_admin()
);

grant select on public.preorder_popup_settings
to anon, authenticated;