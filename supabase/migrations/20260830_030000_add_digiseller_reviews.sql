create table if not exists public.digiseller_reviews (
  id uuid primary key default gen_random_uuid(),
  digiseller_review_id bigint not null,
  digiseller_product_id bigint not null,
  product_id uuid not null references public.products(id) on delete cascade,
  invoice_id bigint,
  marketplace_id bigint,
  sentiment text not null check (sentiment in ('POSITIVE', 'NEGATIVE')),
  product_name text,
  comment text,
  seller_reply text,
  reviewed_at timestamptz not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (digiseller_review_id, product_id)
);

create index if not exists digiseller_reviews_product_date_idx
  on public.digiseller_reviews (product_id, reviewed_at desc);

create index if not exists digiseller_reviews_external_product_idx
  on public.digiseller_reviews (digiseller_product_id);

alter table public.digiseller_reviews enable row level security;
revoke all on public.digiseller_reviews from anon, authenticated;
