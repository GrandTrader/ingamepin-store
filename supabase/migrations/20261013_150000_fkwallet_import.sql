-- Manual, draft-only catalogue imports. This migration never enables purchases.
begin;
create table public.fkwallet_imports (
  product_id uuid primary key references public.products(id) on delete cascade,
  connection_id text not null check (connection_id ~ '^[0-9a-f]{64}$'),
  supplier_category_id bigint not null check (supplier_category_id > 0),
  imported_by uuid not null references auth.users(id),
  markup_percent numeric(7,2) not null check (markup_percent between 0 and 1000),
  exchange_rate numeric(24,8) not null check (exchange_rate > 0 and exchange_rate <= 100000000),
  created_at timestamptz not null default now()
);
create table public.fkwallet_product_links (
  option_id uuid primary key references public.product_options(id) on delete cascade,
  product_id uuid not null references public.fkwallet_imports(product_id) on delete cascade,
  connection_id text not null check (connection_id ~ '^[0-9a-f]{64}$'),
  supplier_product_id bigint not null check (supplier_product_id > 0),
  supplier_cost numeric(24,8) not null check (supplier_cost > 0 and supplier_cost <= 100000000),
  supplier_currency text not null check (supplier_currency ~ '^[A-Z]{3}$'),
  supplier_snapshot jsonb not null check (jsonb_typeof(supplier_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique(connection_id, supplier_product_id)
);
create index fkwallet_links_product on public.fkwallet_product_links(product_id);
alter table public.fkwallet_imports enable row level security;
alter table public.fkwallet_product_links enable row level security;
revoke all on public.fkwallet_imports, public.fkwallet_product_links from public, anon, authenticated;
grant select, insert, update, delete on public.fkwallet_imports, public.fkwallet_product_links to service_role;

create function public.import_fkwallet_draft(p_product_id uuid, p_category_id uuid, p_connection_id text,
  p_supplier_category_id bigint, p_admin_id uuid, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.categories%rowtype; r jsonb; option_id uuid; n integer := 0; lowest numeric;
  existing public.fkwallet_imports%rowtype;
begin
  if p_product_id is null or p_category_id is null or p_supplier_category_id is null or p_supplier_category_id <= 0
    or p_connection_id is null or p_connection_id !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from public.admin_users where user_id = p_admin_id) then raise exception 'Invalid import'; end if;
  -- A lost response and double clicks resolve to the same committed import.
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 0));
  select * into existing from public.fkwallet_imports where product_id = p_product_id;
  if found then
    if existing.connection_id <> p_connection_id or existing.imported_by <> p_admin_id then raise exception 'Import reference already used'; end if;
    return jsonb_build_object('productId', p_product_id, 'replayed', true);
  end if;
  select * into c from public.categories where id = p_category_id and is_active for share;
  if not found or c.category_type not in ('GIFT_CARD','GAME_KEY','SUBSCRIPTION','DIGITAL_PRODUCT','GAME_TOPUP') then raise exception 'Choose an active website category'; end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or octet_length(p_draft::text) > 1000000
    or coalesce(length(btrim(p_draft->>'title')),0) not between 2 and 150
    or coalesce(length(btrim(p_draft->>'region')),0) not between 1 and 100
    or coalesce(length(p_draft->>'titleRu'),0) > 150
    or coalesce(length(p_draft->>'description'),0) > 5000
    or coalesce(length(p_draft->>'descriptionRu'),0) > 5000
    or jsonb_typeof(p_draft->'options') is distinct from 'array'
    or jsonb_array_length(p_draft->'options') not between 1 and 50 then raise exception 'Invalid draft'; end if;
  if coalesce(p_draft->>'markup','') !~ '^\d+(\.\d{1,2})?$' or (p_draft->>'markup')::numeric not between 0 and 1000
    or coalesce(p_draft->>'exchangeRate','') !~ '^\d+(\.\d{1,8})?$'
    or (p_draft->>'exchangeRate')::numeric <= 0 or (p_draft->>'exchangeRate')::numeric > 100000000 then raise exception 'Invalid pricing'; end if;
  if (select count(distinct x->>'supplierId') from jsonb_array_elements(p_draft->'options') x) <> jsonb_array_length(p_draft->'options')
    or (select count(distinct x->>'supplierCurrency') from jsonb_array_elements(p_draft->'options') x) <> 1 then raise exception 'Invalid supplier selection'; end if;
  for r in select value from jsonb_array_elements(p_draft->'options') loop
    if coalesce(r->>'supplierId','') !~ '^[1-9]\d*$' or coalesce(length(btrim(r->>'name')),0) not between 1 and 150
      or coalesce(r->>'price','') !~ '^\d+(\.\d{1,2})?$' or (r->>'price')::numeric not between 0.01 and 9999999.99
      or coalesce(r->>'supplierCost','') !~ '^\d+(\.\d{1,8})?$' or (r->>'supplierCost')::numeric <= 0 or (r->>'supplierCost')::numeric > 100000000
      or coalesce(r->>'denomination','') !~ '^\d+(\.\d{1,4})?$' or (r->>'denomination')::numeric <= 0 or (r->>'denomination')::numeric > 1000000000
      or coalesce(r->>'currency','') !~ '^[A-Z]{3}$' or coalesce(r->>'supplierCurrency','') !~ '^[A-Z]{3}$'
      or coalesce(r->>'optionType','') not in ('CURRENCY','OTHER')
      or jsonb_typeof(r->'supplierSnapshot') is distinct from 'object'
      or coalesce(r->'supplierSnapshot'->>'priceType','') not in ('','FIXED')
      or coalesce(r->'supplierSnapshot'->>'productType','') not in ('','DEFAULT')
      or jsonb_typeof(r->'supplierSnapshot'->'fields') is distinct from 'array'
      or jsonb_array_length(r->'supplierSnapshot'->'fields') <> 0 then raise exception 'Invalid supplier option'; end if;
    if r->>'supplierCurrency' = 'USD' and (p_draft->>'exchangeRate')::numeric <> 1 then raise exception 'USD exchange rate must be 1'; end if;
  end loop;
  select min((x->>'price')::numeric) into lowest from jsonb_array_elements(p_draft->'options') x;
  insert into public.products(id, slug, category_id, name, name_ru, description, description_ru, region,
    product_type, delivery_type, is_bulk_order, currency, price, stock_quantity, status, is_featured,
    allows_fixed_values, allows_custom_value, allows_player_id_topup, allows_gaming_voucher,
    minimum_quantity, maximum_quantity, sold_count)
  values (p_product_id, 'fkwallet-' || p_product_id::text, p_category_id, p_draft->>'title', nullif(p_draft->>'titleRu',''),
    nullif(p_draft->>'description',''), nullif(p_draft->>'descriptionRu',''), p_draft->>'region', c.category_type,
    'MANUAL', false, 'USD', lowest, 0, 'DRAFT', false, true, false, false, true, 1, 1000, 0);
  -- Account-login presets are inappropriate for these field-free digital codes.
  delete from public.product_customer_fields where product_id = p_product_id;
  insert into public.fkwallet_imports(product_id, connection_id, supplier_category_id, imported_by, markup_percent, exchange_rate)
    values (p_product_id, p_connection_id, p_supplier_category_id, p_admin_id, (p_draft->>'markup')::numeric, (p_draft->>'exchangeRate')::numeric);
  for r in select value from jsonb_array_elements(p_draft->'options') loop
    option_id := gen_random_uuid();
    insert into public.product_options(id, product_id, category_id, option_type, option_name, denomination,
      denomination_currency, selling_price, stock_quantity, is_active, is_in_stock, is_custom_value, sort_order)
      values(option_id, p_product_id, p_category_id, r->>'optionType', r->>'name', (r->>'denomination')::numeric,
        r->>'currency', (r->>'price')::numeric, 0, true, false, false, n);
    insert into public.fkwallet_product_links(option_id, product_id, connection_id, supplier_product_id, supplier_cost, supplier_currency, supplier_snapshot)
      values(option_id, p_product_id, p_connection_id, (r->>'supplierId')::bigint, (r->>'supplierCost')::numeric, r->>'supplierCurrency', r->'supplierSnapshot');
    n := n + 1;
  end loop;
  return jsonb_build_object('productId', p_product_id, 'replayed', false);
end $$;
revoke all on function public.import_fkwallet_draft(uuid,uuid,text,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_fkwallet_draft(uuid,uuid,text,bigint,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
