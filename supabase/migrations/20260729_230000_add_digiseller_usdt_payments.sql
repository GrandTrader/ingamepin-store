create table if not exists public.digiseller_usdt_payments (
  invoice_id text primary key,
  gateway_invoice_id text not null unique,
  public_token text not null unique,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD')),
  payment_method_id text not null,
  network text not null check (network in ('TRC20', 'BEP20')),
  return_url text,
  status text not null default 'wait'
    check (status in ('wait', 'paid', 'canceled', 'refunded', 'error')),
  transaction_hash text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digiseller_usdt_payments enable row level security;
revoke all on table public.digiseller_usdt_payments from anon, authenticated;

comment on table public.digiseller_usdt_payments is
  'Private mapping between Digiseller orders and direct USDT gateway invoices.';