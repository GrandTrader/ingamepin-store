create extension if not exists pgcrypto;

do $$ begin
  create type public.delivery_type as enum ('AUTOMATIC', 'MANUAL');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.product_status as enum ('DRAFT', 'ACTIVE', 'INACTIVE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum (
    'PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'PROCESSING',
    'DELIVERED', 'CANCELLED', 'REFUNDED'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_method as enum ('UPI', 'BINANCE_PAY', 'WALLET');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum (
    'PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'FAILED', 'REFUNDED'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.gift_code_status as enum (
    'AVAILABLE', 'RESERVED', 'SOLD', 'DISABLED'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_name text,
  description text,
  image_url text,
  icon text,
  category_type text not null default 'GIFT_CARD',
  delivery_message text,
  allow_custom_amount boolean not null default false,
  custom_amount_min integer,
  custom_amount_max integer,
  custom_amount_max_quantity integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  denomination integer,
  currency text not null default 'INR',
  price numeric(12,2) not null default 0 check (price >= 0),
  delivery_type public.delivery_type not null default 'MANUAL',
  status public.product_status not null default 'DRAFT',
  is_featured boolean not null default false,
  minimum_quantity integer not null default 1,
  maximum_quantity integer not null default 5,
  sort_order integer not null default 0,
  badge text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  rating numeric(3,2) not null default 5,
  sold_count integer not null default 0,
  region text,
  product_type text,
  delivery_instructions text,
  requires_customer_details boolean not null default false,
  allows_fixed_values boolean not null default true,
  allows_custom_value boolean not null default false,
  minimum_custom_value numeric(12,2),
  maximum_custom_value numeric(12,2),
  allows_player_id_topup boolean not null default false,
  allows_gaming_voucher boolean not null default true,
  player_id_label text,
  bulk_order_enabled boolean not null default false,
  bulk_minimum_amount numeric(12,2),
  bulk_discount_percent numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  option_name text not null,
  option_type text not null default 'OTHER',
  denomination integer,
  denomination_currency text,
  platform text,
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_custom_value boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'ADMIN',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text not null,
  customer_phone text,
  currency text not null default 'INR',
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status public.order_status not null default 'PENDING_PAYMENT',
  customer_note text,
  admin_note text,
  access_token_hash text,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_option_id uuid references public.product_options(id),
  product_name text not null,
  option_name text,
  denomination integer,
  platform text,
  custom_value numeric(12,2),
  fulfillment_mode text,
  player_id text,
  order_type text not null default 'RETAIL',
  discount_percent numeric(5,2) not null default 0,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  status public.payment_status not null default 'PENDING',
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  transaction_id text,
  screenshot_url text,
  gateway_order_id text,
  gateway_payment_id text,
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_card_codes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_option_id uuid references public.product_options(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  denomination integer,
  code text not null unique,
  status public.gift_code_status not null default 'AVAILABLE',
  note text,
  reserved_at timestamptz,
  sold_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null,
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  description text,
  order_id uuid references public.orders(id) on delete set null,
  reference_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  payment_method text not null,
  payment_reference text,
  status text not null default 'PENDING',
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  gateway_order_id text,
  gateway_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  order_id uuid references public.orders(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists product_options_product_id_idx on public.product_options(product_id);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_customer_email_idx on public.orders(customer_email);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists gift_card_codes_inventory_idx
  on public.gift_card_codes(product_id, product_option_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'categories','products','product_options','profiles','orders','payments',
    'gift_card_codes','customer_wallets','wallet_topup_requests'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'name', ''), '')
  )
  on conflict (id) do nothing;
  insert into public.customer_wallets(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.gift_card_codes enable row level security;
alter table public.customer_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_topup_requests enable row level security;
alter table public.customer_notifications enable row level security;

create policy "Public reads active categories" on public.categories
for select using (is_active = true or public.is_admin());
create policy "Public reads active products" on public.products
for select using (status = 'ACTIVE' or public.is_admin());
create policy "Public reads active product options" on public.product_options
for select using (is_active = true or public.is_admin());

create policy "Users read own profile" on public.profiles
for select using (id = auth.uid() or public.is_admin());
create policy "Users update own profile" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());
create policy "Admins read admin users" on public.admin_users
for select using (public.is_admin());
create policy "Users read own orders" on public.orders
for select using (customer_id = auth.uid() or public.is_admin());
create policy "Users read own order items" on public.order_items
for select using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and (orders.customer_id = auth.uid() or public.is_admin())
  )
);
create policy "Users read own payments" on public.payments
for select using (
  exists (
    select 1 from public.orders
    where orders.id = payments.order_id
      and (orders.customer_id = auth.uid() or public.is_admin())
  )
);
create policy "Users read own wallet" on public.customer_wallets
for select using (user_id = auth.uid() or public.is_admin());
create policy "Users read own wallet transactions" on public.wallet_transactions
for select using (user_id = auth.uid() or public.is_admin());
create policy "Users read own topups" on public.wallet_topup_requests
for select using (user_id = auth.uid() or public.is_admin());
create policy "Users read own notifications" on public.customer_notifications
for select using (user_id = auth.uid() or public.is_admin());

revoke all on public.gift_card_codes from anon, authenticated;
grant select on public.categories, public.products, public.product_options
to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.orders, public.order_items, public.payments,
  public.customer_wallets, public.wallet_transactions,
  public.wallet_topup_requests, public.customer_notifications
to authenticated;
