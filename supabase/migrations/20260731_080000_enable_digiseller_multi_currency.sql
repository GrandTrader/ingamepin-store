alter table public.digiseller_usdt_payments
  drop constraint if exists digiseller_usdt_payments_currency_check;

alter table public.digiseller_usdt_payments
  add constraint digiseller_usdt_payments_currency_check
  check (currency in ('USD', 'RUB', 'EUR'));

alter table public.digiseller_usdt_payments
  add column if not exists gateway_amount numeric(18, 2),
  add column if not exists gateway_currency text,
  add column if not exists exchange_rate numeric(24, 10);

update public.digiseller_usdt_payments
set
  gateway_amount = amount,
  gateway_currency = 'USD',
  exchange_rate = 1
where gateway_amount is null
  and currency = 'USD';

alter table public.digiseller_usdt_payments
  drop constraint if exists digiseller_usdt_payments_gateway_currency_check;

alter table public.digiseller_usdt_payments
  add constraint digiseller_usdt_payments_gateway_currency_check
  check (gateway_currency is null or gateway_currency = 'USD');

comment on column public.digiseller_usdt_payments.gateway_amount is
  'Final USD amount charged by the selected payment gateway.';

comment on column public.digiseller_usdt_payments.gateway_currency is
  'Gateway settlement currency. Currently USD.';

comment on column public.digiseller_usdt_payments.exchange_rate is
  'Original Digiseller currency units per one USD at invoice creation.';