alter type public.order_status add value if not exists 'TRASHED';

alter table public.orders
  add column if not exists trashed_at timestamptz;

create index if not exists orders_pending_payment_created_at_idx
  on public.orders(created_at)
  where status = 'PENDING_PAYMENT';
