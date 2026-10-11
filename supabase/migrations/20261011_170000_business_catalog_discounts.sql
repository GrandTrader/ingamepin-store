begin;
-- Separate B2B discounts from retail/customer discounts. Zero clears this rule.
create table if not exists public.business_product_discounts (
  product_id uuid primary key references public.products(id) on delete cascade,
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 99.99),
  revision uuid not null default gen_random_uuid(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.business_customer_product_discounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 99.99),
  revision uuid not null default gen_random_uuid(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.business_product_discounts enable row level security;
alter table public.business_customer_product_discounts enable row level security;
revoke all on public.business_product_discounts, public.business_customer_product_discounts from public, anon, authenticated, service_role;
grant select on public.business_product_discounts, public.business_customer_product_discounts to service_role;

create or replace function public.find_business_discount_customer(p_admin uuid,p_email text)
returns table(user_id uuid,email text) language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from admin_users where admin_users.user_id=p_admin) then
    raise exception 'Administrator access required.';
  end if;
  return query select u.id,u.email::text from auth.users u
    where lower(u.email)=lower(btrim(p_email)) and u.deleted_at is null;
end; $$;

create or replace function public.business_discount_percent(p_product uuid,p_user uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from products where id=p_product and business_enabled)
    and not exists(select 1 from seller_product_submissions where product_id=p_product)
  then greatest(
    coalesce((select discount_percent from business_product_discounts where product_id=p_product),0),
    coalesce((select discount_percent from business_customer_product_discounts where product_id=p_product and user_id=p_user),0),
    coalesce((select max(discount_percent) from customer_product_discounts where product_id=p_product and user_id=p_user and is_active),0)
  ) else 0 end;
$$;
create or replace function public.get_business_customer_discounts(p_user uuid,p_products uuid[])
returns table(product_id uuid,discount_percent numeric) language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(cardinality(p_products),0)>500 then raise exception 'Too many products.'; end if;
  return query select p.id,public.business_discount_percent(p.id,p_user)
    from products p where p.id=any(p_products) and p.business_enabled;
end; $$;

create or replace function public.save_business_catalog_discounts(p_admin uuid,p_email text,p_customer uuid,p_changes jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare
  customer uuid; row_data jsonb; pid uuid; pct numeric; expected uuid; current_revision uuid;
  changed integer:=0;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  if nullif(btrim(p_email),'') is not null then
    select u.id into customer from auth.users u where lower(u.email)=lower(btrim(p_email)) and u.deleted_at is null;
    if customer is null then raise exception 'Customer email is not registered.'; end if;
    if p_customer is distinct from customer then raise exception 'Customer account changed. Load the email again.'; end if;
  elsif p_customer is not null then raise exception 'Load a registered customer email first.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'array' then raise exception 'Select 1 to 200 products.'; end if;
  if jsonb_array_length(p_changes) not between 1 and 200 then raise exception 'Select 1 to 200 products.'; end if;
  if (select count(distinct x->>'productId') from jsonb_array_elements(p_changes) x)<>jsonb_array_length(p_changes) then
    raise exception 'Duplicate or missing product.';
  end if;
  -- Product locks serialize first-time inserts as well as edits; a stale batch rolls back entirely.
  for row_data in select x from jsonb_array_elements(p_changes) x order by x->>'productId' loop
    pid:=(row_data->>'productId')::uuid;
    if jsonb_typeof(row_data->'percent') is distinct from 'number' then raise exception 'Discount must be between 0 and 99.99, with up to two decimals.'; end if;
    pct:=(row_data->>'percent')::numeric;
    if pct<0 or pct>99.99 or round(pct,2)<>pct then raise exception 'Discount must be between 0 and 99.99, with up to two decimals.'; end if;
    if not (row_data ? 'revision') then raise exception 'Discount settings changed. Refresh and try again.'; end if;
    expected:=(row_data->>'revision')::uuid;
    perform 1 from products where id=pid and business_enabled and not is_preorder_only for update;
    if not found then raise exception 'Product is unavailable in the B2B catalog.'; end if;
    if exists(select 1 from seller_product_submissions where product_id=pid) then raise exception 'Seller-managed listings cannot use these discounts.'; end if;
    if customer is null then
      select revision into current_revision from business_product_discounts where product_id=pid;
    else
      select revision into current_revision from business_customer_product_discounts where product_id=pid and user_id=customer;
    end if;
    if current_revision is distinct from expected then raise exception 'Discount settings changed. Refresh and try again.'; end if;
    if customer is null then
      insert into business_product_discounts(product_id,discount_percent,updated_by) values(pid,pct,p_admin)
      on conflict(product_id) do update set discount_percent=excluded.discount_percent,updated_by=p_admin,updated_at=now(),revision=gen_random_uuid();
    else
      insert into business_customer_product_discounts(user_id,product_id,discount_percent,updated_by) values(customer,pid,pct,p_admin)
      on conflict(user_id,product_id) do update set discount_percent=excluded.discount_percent,updated_by=p_admin,updated_at=now(),revision=gen_random_uuid();
    end if;
    changed:=changed+1;
  end loop;
  return changed;
end; $$;

revoke all on function public.find_business_discount_customer(uuid,text),public.business_discount_percent(uuid,uuid),public.get_business_customer_discounts(uuid,uuid[]),public.save_business_catalog_discounts(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.find_business_discount_customer(uuid,text),public.business_discount_percent(uuid,uuid),public.get_business_customer_discounts(uuid,uuid[]),public.save_business_catalog_discounts(uuid,text,uuid,jsonb) to service_role;

-- Keep the installed checkout's stock, payment, promotion and idempotency logic intact.
do $$
declare src text; old_join text; new_join text;
begin
  src:=pg_get_functiondef('public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)'::regprocedure);
  if position('/* business-catalog-discounts-v1 */' in src)>0 then return; end if;
  old_join:='left join customer_product_discounts d on d.product_id=i.product_id and d.user_id=p_user and d.is_active';
  new_join:='left join lateral (select public.business_discount_percent(i.product_id,p_user) as discount_percent) d on true /* business-catalog-discounts-v1 */';
  if (length(src)-length(replace(src,old_join,'')))/length(old_join)<>2 then
    raise exception 'Unexpected business checkout definition; discount installation stopped.';
  end if;
  src:=replace(src,old_join,new_join);
  if position('/* business-catalog-discounts-v1 */' in src)=0 then
    raise exception 'Unexpected business checkout marker; discount installation stopped.';
  end if;
  execute src;
end; $$;

commit;
