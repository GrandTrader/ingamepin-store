alter table public.payment_gateway_settings
  add column if not exists gateway_commissions jsonb not null default
    '{
      "WALLET": {"type": "PERCENTAGE", "value": 0, "enabled": true},
      "UPI": {"type": "PERCENTAGE", "value": 0, "enabled": false},
      "BINANCE_PAY": {"type": "PERCENTAGE", "value": 0, "enabled": true},
      "USDT_DIRECT": {"type": "PERCENTAGE", "value": 0, "enabled": true},
      "PALLY": {"type": "PERCENTAGE", "value": 0, "enabled": true},
      "FREEKASSA": {"type": "PERCENTAGE", "value": 0, "enabled": true}
    }'::jsonb;

alter table public.payment_gateway_settings
  drop constraint if exists payment_gateway_settings_gateway_commissions_object;

alter table public.payment_gateway_settings
  add constraint payment_gateway_settings_gateway_commissions_object
  check (jsonb_typeof(gateway_commissions) = 'object');

comment on column public.payment_gateway_settings.gateway_commissions is
  'Server-managed percentage or fixed customer fee settings for each payment gateway.';

alter table public.orders
  add column if not exists payment_fee numeric(12, 2) not null default 0
    check (payment_fee >= 0),
  add column if not exists payment_fee_type text
    check (payment_fee_type is null or payment_fee_type in ('PERCENTAGE', 'FIXED')),
  add column if not exists payment_fee_value numeric(12, 4)
    check (payment_fee_value is null or payment_fee_value >= 0);

comment on column public.orders.payment_fee is
  'Payment gateway fee charged to the customer and included in the order total.';

comment on column public.orders.payment_fee_type is
  'Snapshot of the gateway fee calculation type used when the order was created.';

comment on column public.orders.payment_fee_value is
  'Snapshot of the configured percentage or fixed fee value used for this order.';
