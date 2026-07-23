create table if not exists public.customer_product_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  discount_percent numeric(5,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id),
  constraint customer_product_discounts_percent_check
    check (discount_percent > 0 and discount_percent <= 100)
);

create index if not exists customer_product_discounts_user_id_idx
  on public.customer_product_discounts(user_id)
  where is_active = true;

create index if not exists customer_product_discounts_product_id_idx
  on public.customer_product_discounts(product_id)
  where is_active = true;

alter table public.customer_product_discounts enable row level security;

comment on table public.customer_product_discounts is
  'Admin-assigned discounts for specific registered customers and products.';
