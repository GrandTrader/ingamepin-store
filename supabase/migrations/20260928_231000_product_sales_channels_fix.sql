-- PRODUCT CHANNELS FIX V2 - run this complete file in a NEW SQL query.
begin;

-- Existing products stay available in both channels until an administrator changes them.
alter table public.products add column if not exists retail_enabled boolean not null default true;
alter table public.products add column if not exists business_enabled boolean not null default true;

-- ALTER FUNCTION ... SET custom parameters requires superuser permissions.
-- Set the channel only around order creation instead. Restore it on success;
-- the existing checkout subtransaction restores it automatically on failure.
do $migration$
declare
  source text;
  original_source text;
  start_marker text := '  if has_seller then';
  end_marker text := '  oid:=(made->>''id'')::uuid;';
begin
  select pg_get_functiondef('public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)'::regprocedure) into original_source;
  -- A previously saved function definition can still contain the forbidden
  -- function-level SET. Remove only that setting, preserving the function body,
  -- search_path, security mode, owner and execute permissions.
  source := regexp_replace(original_source,
    E'\\n[ \t]*SET "?app[.]order_sales_channel"? TO [^\\n]*', '', 'g');
  if position('-- product-sales-channel-runtime-v1' in source)=0 then
    if (length(source)-length(replace(source,start_marker,'')))<>length(start_marker)
       or (length(source)-length(replace(source,end_marker,'')))<>length(end_marker) then
      raise exception 'The installed portal checkout differs from the expected version. No changes were applied.';
    end if;
    source := replace(source,start_marker,$patch$
  -- product-sales-channel-runtime-v1
  declare prior_sales_channel text := current_setting('app.order_sales_channel',true);
  begin
   perform set_config('app.order_sales_channel','BUSINESS',true);
  if has_seller then$patch$);
    source := replace(source,end_marker,$patch$
   perform set_config('app.order_sales_channel',coalesce(prior_sales_channel,''),true);
  end;
  oid:=(made->>'id')::uuid;$patch$);
  end if;
  if source <> original_source then execute source; end if;
end $migration$;

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
