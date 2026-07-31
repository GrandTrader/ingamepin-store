alter table public.digiseller_usdt_payments
  drop constraint if exists digiseller_usdt_payments_network_check;

alter table public.digiseller_usdt_payments
  add constraint digiseller_usdt_payments_network_check
  check (network in ('TRC20', 'BEP20', 'SOLANA', 'BINANCE_PAY'));

alter table public.digiseller_usdt_payments
  add column if not exists checkout_url text,
  add column if not exists digiseller_notified_at timestamptz;

comment on column public.digiseller_usdt_payments.network is
  'Digiseller payment channel: TRC20, BEP20, SOLANA, or BINANCE_PAY.';

comment on column public.digiseller_usdt_payments.checkout_url is
  'Private hosted checkout URL for redirect-based payment methods.';

comment on column public.digiseller_usdt_payments.digiseller_notified_at is
  'Time when Digiseller was notified that the payment was completed.';
