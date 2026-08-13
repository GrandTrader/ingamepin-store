create table if not exists public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  sentiment text not null check (sentiment in ('POSITIVE', 'NEGATIVE')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_reviews_comment_length check (
    comment is null or char_length(comment) <= 1000
  )
);

create index if not exists order_reviews_sentiment_created_idx
  on public.order_reviews (sentiment, created_at desc);

alter table public.order_reviews enable row level security;

revoke all on table public.order_reviews from anon, authenticated;

