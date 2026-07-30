alter table public.digiseller_usdt_payments
  drop constraint if exists digiseller_usdt_payments_network_check;

alter table public.digiseller_usdt_payments
  add constraint digiseller_usdt_payments_network_check
  check (network in ('TRC20', 'BEP20', 'SOLANA'));

comment on column public.digiseller_usdt_payments.network is
  'Direct USDT payment network: TRC20, BEP20, or SOLANA.';