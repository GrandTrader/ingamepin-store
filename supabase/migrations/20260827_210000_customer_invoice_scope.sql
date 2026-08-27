alter table public.saved_invoices
  add column if not exists order_item_id uuid references public.order_items(id) on delete set null;

drop index if exists public.saved_invoices_customer_order_unique;

create unique index if not exists saved_invoices_customer_full_order_unique
  on public.saved_invoices (order_id)
  where source = 'CUSTOMER_ORDER' and order_id is not null and order_item_id is null;

create unique index if not exists saved_invoices_customer_order_item_unique
  on public.saved_invoices (order_id, order_item_id)
  where source = 'CUSTOMER_ORDER' and order_id is not null and order_item_id is not null;
