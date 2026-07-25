alter table public.orders
  add column if not exists telegram_notified_at timestamptz;

comment on column public.orders.telegram_notified_at is
  'Time when the verified-payment Telegram notification was successfully claimed and sent.';
