begin;

-- Existing products stay available in both channels until an administrator changes them.
alter table public.products add column if not exists retail_enabled boolean not null default true;
alter table public.products add column if not exists business_enabled boolean not null default true;

-- This setting is scoped to the service-only portal function and automatically
-- restored when it returns (including quotes, errors and idempotent replays).
alter function public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)
  set app.order_sales_channel to 'BUSINESS';

create or replace function public.guard_product_sales_channel()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  product_name text;
  retail_allowed boolean;
  business_allowed boolean;
  is_business boolean := coalesce(current_setting('app.order_sales_channel',true),'')='BUSINESS'
    or coalesce(current_setting('app.business_bulk_api',true),'')='yes';
begin
  -- Serialize against an admin disabling the product during checkout.
  select name,retail_enabled,business_enabled into product_name,retail_allowed,business_allowed
    from products where id=new.product_id for no key update;
  if not found then raise exception 'The selected product is unavailable.'; end if;
  if is_business and business_allowed is not true then
    raise exception '% is unavailable in the business portal.',product_name;
  elsif not is_business and retail_allowed is not true then
    raise exception '% is unavailable in the retail store.',product_name;
  end if;
  return new;
end $$;
revoke all on function public.guard_product_sales_channel() from public,anon,authenticated;
drop trigger if exists product_sales_channel_guard on public.order_items;
create trigger product_sales_channel_guard before insert on public.order_items
  for each row execute function public.guard_product_sales_channel();

notify pgrst, 'reload schema';
commit;
