-- Preserve fractional face values through product import, checkout and code delivery.
-- Expands the previous integer fields without changing existing values or prices.
begin;
set local lock_timeout = '5s';
alter table public.products alter column denomination type numeric(14,4) using denomination::numeric;
alter table public.product_options alter column denomination type numeric(14,4) using denomination::numeric;
alter table public.order_items alter column denomination type numeric(14,4) using denomination::numeric;
alter table public.gift_card_codes alter column denomination type numeric(14,4) using denomination::numeric;
notify pgrst, 'reload schema';
commit;
