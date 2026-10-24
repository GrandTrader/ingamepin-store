-- Restricted products require a verified account supplied by a server-only checkout wrapper.
-- Existing orders and unrestricted guest checkout are not changed.
begin;

revoke all on function public.create_store_order(text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_store_order(text,text,text,text,jsonb,text) to service_role;

create or replace function public.guard_restricted_product_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid; owner_id uuid;
begin
  if not exists(select 1 from public.product_purchase_restrictions r
    where r.product_id=NEW.product_id and r.is_enabled) then
    return NEW;
  end if;
  -- Only the service-only business/purchase wrappers set this transaction-local identity.
  actor:=nullif(current_setting('app.business_buyer',true),'')::uuid;
  if actor is null or not exists(select 1 from auth.users u
    where u.id=actor and u.email is not null and u.email_confirmed_at is not null) then
    raise exception 'Sign in with a verified account to buy products with purchase limits.';
  end if;
  select customer_id into owner_id from public.orders where id=NEW.order_id for update;
  if owner_id is not null and owner_id<>actor then
    raise exception 'This order belongs to another account.';
  end if;
  -- Persist account identity even for restrictions that only cap total face value.
  update public.orders set customer_id=actor where id=NEW.order_id and customer_id is null;
  return NEW;
end $$;

revoke all on function public.guard_restricted_product_account() from public,anon,authenticated;
drop trigger if exists restricted_product_verified_account on public.order_items;
create trigger restricted_product_verified_account before insert on public.order_items
  for each row execute function public.guard_restricted_product_account();

commit;
