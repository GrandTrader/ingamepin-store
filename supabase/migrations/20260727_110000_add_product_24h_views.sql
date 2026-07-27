create table if not exists public.product_views (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id) on delete cascade,
  visitor_hash text not null,
  last_viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (product_id, visitor_hash)
);

create index if not exists product_views_last_viewed_at_idx
  on public.product_views(last_viewed_at desc);

create index if not exists product_views_product_last_viewed_idx
  on public.product_views(product_id, last_viewed_at desc);

alter table public.product_views enable row level security;

revoke all on table public.product_views from anon, authenticated;
grant select on table public.product_views to authenticated;

drop policy if exists "Admins read product views"
  on public.product_views;

create policy "Admins read product views"
  on public.product_views
  for select
  to authenticated
  using (public.is_admin());

comment on table public.product_views is
  'Privacy-friendly unique product visitors. Visitor identifiers are stored only as SHA-256 hashes.';
