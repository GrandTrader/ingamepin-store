begin;

alter table public.products
  add column if not exists allowed_payment_methods text[];

alter table public.products
  add column if not exists allowed_usdt_networks text[];

update public.products
set allowed_payment_methods = array[
  'WALLET',
  'BINANCE_PAY',
  'USDT_DIRECT',
  'PALLY',
  'FREEKASSA'
]::text[]
where allowed_payment_methods is null;

update public.products
set allowed_usdt_networks = array[
  'TRC20',
  'BEP20',
  'SOLANA'
]::text[]
where allowed_usdt_networks is null;

alter table public.products
  alter column allowed_payment_methods
  set default array[
    'WALLET',
    'BINANCE_PAY',
    'USDT_DIRECT',
    'PALLY',
    'FREEKASSA'
  ]::text[],
  alter column allowed_payment_methods set not null,
  alter column allowed_usdt_networks
  set default array[
    'TRC20',
    'BEP20',
    'SOLANA'
  ]::text[],
  alter column allowed_usdt_networks set not null;

alter table public.products
  drop constraint if exists products_allowed_payment_methods_check;

alter table public.products
  add constraint products_allowed_payment_methods_check
  check (
    cardinality(allowed_payment_methods) > 0
    and allowed_payment_methods <@ array[
      'WALLET',
      'BINANCE_PAY',
      'USDT_DIRECT',
      'PALLY',
      'FREEKASSA'
    ]::text[]
  );

alter table public.products
  drop constraint if exists products_allowed_usdt_networks_check;

alter table public.products
  add constraint products_allowed_usdt_networks_check
  check (
    cardinality(allowed_usdt_networks) > 0
    and allowed_usdt_networks <@ array[
      'TRC20',
      'BEP20',
      'SOLANA'
    ]::text[]
  );

comment on column public.products.allowed_payment_methods is
  'Checkout payment gateways allowed for this product.';

comment on column public.products.allowed_usdt_networks is
  'Direct USDT networks allowed for this product.';

commit;
