create table if not exists public.saved_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  source text not null default 'ADMIN'
    check (source in ('ADMIN', 'CUSTOMER_ORDER')),
  order_id uuid references public.orders(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  invoice_date date not null,
  payment_status text not null
    check (payment_status in ('PAID', 'PENDING')),
  currency text not null default 'USDT',
  total numeric(14, 2) not null check (total >= 0),
  invoice_data jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists saved_invoices_customer_order_unique
  on public.saved_invoices (order_id)
  where source = 'CUSTOMER_ORDER' and order_id is not null;

create index if not exists saved_invoices_created_at_idx
  on public.saved_invoices (created_at desc);

create index if not exists saved_invoices_customer_email_idx
  on public.saved_invoices (lower(customer_email));

alter table public.saved_invoices enable row level security;

revoke all on table public.saved_invoices from anon, authenticated;
grant all on table public.saved_invoices to service_role;

comment on table public.saved_invoices is
  'Immutable invoice snapshots created from admin direct sales or paid customer orders.';
