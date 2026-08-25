alter table public.digiseller_usdt_payments
  drop constraint if exists digiseller_usdt_payments_network_check;

alter table public.digiseller_usdt_payments
  add constraint digiseller_usdt_payments_network_check
  check (network in ('TRC20', 'BEP20', 'SOLANA', 'BINANCE_PAY', 'FREEKASSA_FPS'));

comment on column public.digiseller_usdt_payments.network is
  'DigiSeller payment gateway: TRC20, BEP20, SOLANA, BINANCE_PAY, or FREEKASSA_FPS.';
