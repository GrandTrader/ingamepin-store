-- Wupex full supplier integration. Run once in Supabase SQL Editor.
-- Safe to retry: all changes commit together; repeated installation is skipped.
-- This creates no products, sends no orders and changes no customer balances.
begin;
create table if not exists public.wupex_installation_state(version integer primary key,installed_at timestamptz not null default now());
alter table public.wupex_installation_state enable row level security;
revoke all on public.wupex_installation_state from public,anon,authenticated;
grant select on public.wupex_installation_state to service_role;
do $wupex_install$
begin
 if exists(select 1 from public.wupex_installation_state where version=1) then return; end if;
 if to_regclass('public.wupex_imports') is not null then raise exception 'A partial Wupex installation already exists. Ask for the matching update before continuing.'; end if;
 execute $wupex_bundle$
-- 20261026_010000_wupex_connection.sql
-- Private supplier connection; this update does not import products or create orders.

create table if not exists public.wupex_settings (
  id boolean primary key default true check (id),
  credentials_ciphertext text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.wupex_settings enable row level security;
revoke all on public.wupex_settings from public, anon, authenticated;
grant select, insert, update on public.wupex_settings to service_role;
notify pgrst, 'reload schema';

-- 20261026_020000_wupex_import.sql
-- Manual, draft-only catalogue imports. This migration never enables purchases.

create table public.wupex_imports (
  product_id uuid primary key references public.products(id) on delete cascade,
  connection_id text not null check (connection_id ~ '^[0-9a-f]{64}$'),
  imported_by uuid not null references auth.users(id),
  markup_percent numeric(7,2) not null check (markup_percent between 0 and 1000),
  exchange_rate numeric(24,8) not null check (exchange_rate > 0 and exchange_rate <= 100000000),
  created_at timestamptz not null default now()
);
create table public.wupex_product_links (
  option_id uuid primary key references public.product_options(id) on delete cascade,
  product_id uuid not null references public.wupex_imports(product_id) on delete cascade,
  connection_id text not null check (connection_id ~ '^[0-9a-f]{64}$'),
  supplier_product_id bigint not null check (supplier_product_id > 0),
  supplier_cost numeric(24,8) not null check (supplier_cost > 0 and supplier_cost <= 100000000),
  supplier_currency text not null check (supplier_currency ~ '^[A-Z]{3}$'),
  supplier_snapshot jsonb not null check (jsonb_typeof(supplier_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique(connection_id, supplier_product_id)
);
create index wupex_links_product on public.wupex_product_links(product_id);
alter table public.wupex_imports enable row level security;
alter table public.wupex_product_links enable row level security;
revoke all on public.wupex_imports, public.wupex_product_links from public, anon, authenticated;
grant select, insert, update, delete on public.wupex_imports, public.wupex_product_links to service_role;

alter table public.wupex_imports add column if not exists customer_fields jsonb not null default '[]'::jsonb
  check (jsonb_typeof(customer_fields) = 'array');
comment on column public.wupex_imports.customer_fields is 'Private supplier keys mapped to product customer field IDs for imported delivery forms.';
create or replace function public.import_wupex_draft(p_product_id uuid, p_category_id uuid, p_connection_id text,
  p_admin_id uuid, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.categories%rowtype; r jsonb; option_id uuid; n integer := 0; lowest numeric;
  existing public.wupex_imports%rowtype;
  customer_fields jsonb; customer_field jsonb; field_id uuid; field_index integer := 0; field_links jsonb := '[]'::jsonb;
begin
  if p_product_id is null or p_category_id is null
    or p_connection_id is null or p_connection_id !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from public.admin_users where user_id = p_admin_id) then raise exception 'Invalid import'; end if;
  -- A lost response and double clicks resolve to the same committed import.
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 0));
  select * into existing from public.wupex_imports where product_id = p_product_id;
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
  customer_fields := coalesce(p_draft->'customerFields', '[]'::jsonb);
  if jsonb_typeof(customer_fields) is distinct from 'array' or jsonb_array_length(customer_fields) > 10 then raise exception 'Invalid customer fields'; end if;
  if (select count(distinct x->>'key') from jsonb_array_elements(customer_fields) x) <> jsonb_array_length(customer_fields) then raise exception 'Duplicate customer fields'; end if;
  for customer_field in select value from jsonb_array_elements(customer_fields) loop
    if coalesce(customer_field->>'key','') !~ '^[A-Za-z0-9_-]{1,100}$'
      or coalesce(length(btrim(customer_field->>'label')),0) not between 1 and 80
      or coalesce(length(customer_field->>'placeholder'),0) > 150
      or coalesce(customer_field->>'fieldType','') not in ('TEXT','EMAIL','NUMBER','TEXTAREA')
      or customer_field->'isRequired' is distinct from 'true'::jsonb then raise exception 'Invalid customer field'; end if;
  end loop;
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
      or coalesce(r->'supplierSnapshot'->>'cardType','') not in ('voucher','topup')
      or coalesce(length(r->'supplierSnapshot'->>'sku'),0) not between 1 and 250
      or coalesce(r->'supplierSnapshot'->>'priceType','') not in ('','FIXED')
      or coalesce(r->'supplierSnapshot'->>'productType','') not in ('','DEFAULT')
      or jsonb_typeof(r->'supplierSnapshot'->'fields') is distinct from 'array'
      or jsonb_array_length(r->'supplierSnapshot'->'fields') <> jsonb_array_length(customer_fields) then raise exception 'Invalid supplier option'; end if;
    if (select count(distinct x->>'key') from jsonb_array_elements(r->'supplierSnapshot'->'fields') x) <> jsonb_array_length(customer_fields) then raise exception 'Invalid supplier fields'; end if;
    for customer_field in select value from jsonb_array_elements(r->'supplierSnapshot'->'fields') loop
      if jsonb_typeof(customer_field->'values') is distinct from 'array'
        or jsonb_array_length(customer_field->'values') <> 0
        or coalesce(customer_field->'hasChoices','false'::jsonb) <> 'false'::jsonb
        or not exists(select 1 from jsonb_array_elements(customer_fields) x where x->>'key' = customer_field->>'key'
          and x->>'fieldType' = upper(customer_field->>'type')) then raise exception 'Unsupported supplier customer field'; end if;
    end loop;
    if r->>'supplierCurrency' = 'USD' and (p_draft->>'exchangeRate')::numeric <> 1 then raise exception 'USD exchange rate must be 1'; end if;
  end loop;
  select min((x->>'price')::numeric) into lowest from jsonb_array_elements(p_draft->'options') x;
  insert into public.products(id, slug, category_id, name, name_ru, description, description_ru, region,
    product_type, delivery_type, is_bulk_order, currency, price, stock_quantity, status, is_featured,
    allows_fixed_values, allows_custom_value, allows_player_id_topup, allows_gaming_voucher,
    minimum_quantity, maximum_quantity, sold_count)
  values (p_product_id, 'wupex-' || p_product_id::text, p_category_id, p_draft->>'title', nullif(p_draft->>'titleRu',''),
    nullif(p_draft->>'description',''), nullif(p_draft->>'descriptionRu',''), p_draft->>'region', c.category_type,
    'MANUAL', false, 'USD', lowest, 0, 'DRAFT', false, true, false, false, true, 1, 1000, 0);
  -- Replace automatic category presets with the verified supplier delivery fields.
  delete from public.product_customer_fields where product_id = p_product_id;
  for customer_field in select value from jsonb_array_elements(customer_fields) loop
    field_id := gen_random_uuid();
    insert into public.product_customer_fields(id, product_id, label, placeholder, field_type, is_required, sort_order)
      values(field_id, p_product_id, customer_field->>'label', nullif(customer_field->>'placeholder',''), customer_field->>'fieldType', true, field_index);
    field_links := field_links || jsonb_build_array(customer_field || jsonb_build_object('fieldId', field_id));
    field_index := field_index + 1;
  end loop;
  insert into public.wupex_imports(product_id, connection_id, imported_by, markup_percent, exchange_rate, customer_fields)
    values (p_product_id, p_connection_id, p_admin_id, (p_draft->>'markup')::numeric, (p_draft->>'exchangeRate')::numeric, field_links);
  for r in select value from jsonb_array_elements(p_draft->'options') loop
    option_id := gen_random_uuid();
    insert into public.product_options(id, product_id, category_id, option_type, option_name, denomination,
      denomination_currency, selling_price, stock_quantity, is_active, is_in_stock, is_custom_value, sort_order)
      values(option_id, p_product_id, p_category_id, r->>'optionType', r->>'name', (r->>'denomination')::numeric,
        r->>'currency', (r->>'price')::numeric, 0, true, false, false, n);
    insert into public.wupex_product_links(option_id, product_id, connection_id, supplier_product_id, supplier_cost, supplier_currency, supplier_snapshot)
      values(option_id, p_product_id, p_connection_id, (r->>'supplierId')::bigint, (r->>'supplierCost')::numeric, r->>'supplierCurrency', r->'supplierSnapshot');
    n := n + 1;
  end loop;
  return jsonb_build_object('productId', p_product_id, 'replayed', false);
end $$;
revoke all on function public.import_wupex_draft(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_wupex_draft(uuid,uuid,text,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';

-- 20261026_030000_wupex_fulfillment.sql
-- No products are activated and no external purchase is made by this migration.
-- Reuse the protected supplier queue so payment/refund/cancellation locks apply.

alter table products drop constraint products_stock_source_check;
alter table products add constraint products_stock_source_check check(stock_source in ('OWNED','DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX'));
alter table definiteplay_jobs drop constraint definiteplay_jobs_provider_check;
alter table definiteplay_jobs add constraint definiteplay_jobs_provider_check check(provider in ('DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX'));

create table wupex_delivery_settings (
 product_id uuid primary key references wupex_imports(product_id),
 delivery_kind text not null check(delivery_kind in ('CODE','ACCOUNT')),
 updated_at timestamptz not null default now(), stock_synced_at timestamptz not null default 'epoch'
);
create table wupex_worker_state (
 id boolean primary key default true check(id), connection_id text not null check(connection_id ~ '^[0-9a-f]{64}$'),
 seen_at timestamptz not null default now()
);
create table wupex_units (
 item_id uuid not null references definiteplay_jobs(item_id), ordinal integer not null check(ordinal between 1 and 1000),
 connection_id text not null, request_key text not null unique,
 submitted_at timestamptz, request_ciphertext text, provider_id text,
 provider_status text check(provider_status in ('in_process','success','error','cancel','refund','unknown')),
 result_ciphertext text, charged_amount numeric(24,8) check(charged_amount>0 and charged_amount::text not in ('NaN','Infinity','-Infinity')),
 primary key(item_id,ordinal), unique(connection_id,provider_id)
);
alter table wupex_delivery_settings enable row level security;
alter table wupex_worker_state enable row level security;
alter table wupex_units enable row level security;
revoke all on wupex_delivery_settings,wupex_worker_state,wupex_units from public,anon,authenticated;
grant select,insert,update,delete on wupex_delivery_settings,wupex_worker_state,wupex_units to service_role;

-- Preserve all installed stock/range rules. Fail atomically on an unknown schema.
do $$ declare fn text; src text; changed text; begin
 foreach fn in array array['reconcile_code_inventory(uuid)','guard_order_item_combined_stock()','guard_definiteplay_codes()','guard_definiteplay_product()'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  changed:=replace(src,$q$in ('DEFINITEPLAY','GIFTPORT','FKWALLET')$q$,$q$in ('DEFINITEPLAY','GIFTPORT','FKWALLET','WUPEX')$q$);
  if changed=src then raise exception 'Unrecognised supplier guard: %',fn; end if;
  execute changed;
 end loop;
 src:=pg_get_functiondef('public.guard_definiteplay_item()'::regprocedure);
 changed:=replace(src,'NEW.service_delivered_at is distinct from OLD.service_delivered_at',
  $q$(NEW.service_delivered_at is distinct from OLD.service_delivered_at and not (coalesce(current_setting('app.wupex_delivery',true),'')=OLD.id::text and exists(select 1 from definiteplay_jobs where item_id=OLD.id and provider='WUPEX')))$q$);
 if changed=src then raise exception 'Unrecognised supplier item guard'; end if;
 execute changed;
 src:=pg_get_functiondef('public.complete_definiteplay_job(uuid,uuid,text[],numeric)'::regprocedure);
 changed:=replace(src,$q$case when j.provider='FKWALLET'$q$,$q$case when j.provider='WUPEX' then 'Wupex: ' when j.provider='FKWALLET'$q$);
 if changed=src then raise exception 'Unrecognised supplier receipt function'; end if;
 execute changed;
end $$;

create function configure_wupex_product(p_product_id uuid,p_enabled boolean,p_kind text,p_connection text)
returns void language plpgsql security definer set search_path=public as $$
declare p products%rowtype; imp wupex_imports%rowtype;
begin
 select * into p from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id;
 if p.id is null or imp.product_id is null or p.seller_id is not null or p.stock_source not in ('OWNED','WUPEX') or p_enabled is null then raise exception 'Invalid Wupex product'; end if;
 if exists(select 1 from definiteplay_jobs j join order_items i on i.id=j.item_id join orders o on o.id=j.order_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then raise exception 'Resolve existing supplier orders first'; end if;
 if not p_enabled then
  update products set stock_source='OWNED',delivery_type='MANUAL' where id=p_product_id;
  delete from definiteplay_stock where product_id=p_product_id;
  delete from wupex_delivery_settings where product_id=p_product_id;
  perform reconcile_code_inventory(p_product_id); return;
 end if;
 if p_kind is null or p_kind not in ('CODE','ACCOUNT') or p_connection is distinct from imp.connection_id then raise exception 'Invalid delivery setup'; end if;
 if not exists(select 1 from wupex_worker_state where id and connection_id=p_connection and seen_at>now()-interval '3 minutes') then raise exception 'Start the Wupex delivery worker first'; end if;
 if p.allows_custom_value or p.allows_player_id_topup then raise exception 'Fixed imported options only'; end if;
 if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then raise exception 'Use a separate supplier product'; end if;
 if not exists(select 1 from product_options where product_id=p_product_id and is_active) or
  exists(select 1 from product_options o left join wupex_product_links l on l.option_id=o.id and l.product_id=o.product_id and l.connection_id=imp.connection_id where o.product_id=p_product_id and o.is_active and (l.option_id is null or o.is_custom_value or l.supplier_cost<=0)) then raise exception 'Link every fixed option first'; end if;
 if (select count(*) from product_customer_fields where product_id=p_product_id)<>jsonb_array_length(imp.customer_fields) or
  exists(select 1 from jsonb_array_elements(imp.customer_fields)x where not exists(select 1 from product_customer_fields where id=(x->>'fieldId')::uuid and product_id=p_product_id and field_type=x->>'fieldType' and is_required)) then raise exception 'Restore the imported customer fields first'; end if;
 if exists(select 1 from wupex_product_links where product_id=p_product_id and (supplier_snapshot->>'cardType') is distinct from (case when p_kind='CODE' then 'voucher' else 'topup' end)) then raise exception 'Delivery type does not match supplier products'; end if;
 if p_kind='ACCOUNT' and jsonb_array_length(imp.customer_fields)=0 then raise exception 'Account delivery requires recipient fields'; end if;
 insert into wupex_delivery_settings(product_id,delivery_kind) values(p_product_id,p_kind)
 on conflict(product_id) do update set delivery_kind=excluded.delivery_kind,updated_at=now();
 delete from definiteplay_stock where product_id=p_product_id;
 insert into definiteplay_stock(option_id,product_id,sku,unit_cost)
 select l.option_id,l.product_id,'WX'||l.supplier_product_id,ceil(l.supplier_cost/imp.exchange_rate*100000000)/100000000 from wupex_product_links l where l.product_id=p_product_id;
 update products set stock_source='WUPEX',delivery_type='MANUAL',stock_quantity=0 where id=p_product_id;
 update product_options set stock_quantity=0,is_in_stock=false where product_id=p_product_id;
end $$;

create function sync_wupex_stock(p_product_id uuid,p_connection text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r record; qty integer;
begin
 perform 1 from products where id=p_product_id and stock_source='WUPEX' for update;
 if not found then return; end if;
 if not exists(select 1 from wupex_imports where product_id=p_product_id and connection_id=p_connection) or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid Wupex stock update'; end if;
 for r in select s.option_id,x.value as facts from definiteplay_stock s left join lateral(select value from jsonb_array_elements(p_rows) where value->>'optionId'=s.option_id::text limit 1)x on true where s.product_id=p_product_id loop
  qty:=least(1000,greatest(0,coalesce((r.facts->>'quantity')::integer,0)));
  update definiteplay_stock set available_quantity=qty,synced_at=now() where option_id=r.option_id;
  update product_options set stock_quantity=qty,is_in_stock=qty>0,updated_at=now() where id=r.option_id;
 end loop;
 update products set stock_quantity=coalesce((select sum(stock_quantity)::integer from product_options where product_id=p_product_id and is_active),0),updated_at=now() where id=p_product_id;
 update wupex_delivery_settings set stock_synced_at=now() where product_id=p_product_id;
end $$;

create function snapshot_wupex_order_item() returns trigger language plpgsql security definer set search_path=public as $$
declare imp wupex_imports%rowtype; link wupex_product_links%rowtype; kind text; cost numeric;
begin
 if not exists(select 1 from products where id=NEW.product_id and stock_source='WUPEX') then return NEW; end if;
 if NEW.fulfillment_mode<>'CODE' or NEW.custom_value is not null then raise exception 'Wupex supports fixed imported options only'; end if;
 select * into imp from wupex_imports where product_id=NEW.product_id;
 select * into link from wupex_product_links where option_id=NEW.product_option_id and product_id=NEW.product_id and connection_id=imp.connection_id;
 select delivery_kind into kind from wupex_delivery_settings where product_id=NEW.product_id;
 select unit_cost into cost from definiteplay_stock where option_id=NEW.product_option_id;
 if link.option_id is null or kind is null or cost is null or cost<=0 then raise exception 'Wupex delivery is not configured'; end if;
 if not exists(select 1 from wupex_worker_state where id and connection_id=imp.connection_id and seen_at>now()-interval '3 minutes') then raise exception 'Wupex delivery is temporarily unavailable'; end if;
 insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,provider,supplier_payload)
 values(NEW.id,NEW.order_id,'IGPWX'||replace(NEW.id::text,'-',''),'WX'||link.supplier_product_id,NEW.quantity,cost,'WUPEX',
  jsonb_build_object('connectionId',imp.connection_id,'productId',link.supplier_product_id,
   'supplierCost',link.supplier_cost,'currency',link.supplier_currency,'exchangeRate',imp.exchange_rate,'deliveryKind',kind,
   'sku',link.supplier_snapshot->>'sku','cardType',link.supplier_snapshot->>'cardType','subType',link.supplier_snapshot->'subType','productName',link.supplier_snapshot->>'name','fieldMap',imp.customer_fields,'customerInformation',coalesce(NEW.customer_information,'[]'::jsonb)));
 insert into wupex_units(item_id,ordinal,connection_id,request_key)
 select NEW.id,n,imp.connection_id,'igpwx-'||NEW.id::text||'-'||n from generate_series(1,NEW.quantity)n;
 return NEW;
end $$;
create trigger snapshot_wupex_order_item after insert on order_items for each row execute function snapshot_wupex_order_item();

create function mark_wupex_unit_submitted(p_item_id uuid,p_token uuid,p_ordinal integer,p_request text)
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype; o orders%rowtype;
begin
 select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.state not in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') then raise exception 'Lease was lost'; end if;
 if o.paid_at is null or o.currency<>'USD' or o.status not in ('PAID','PROCESSING') or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) then raise exception 'Payment is not verified'; end if;
 if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') or exists(select 1 from order_refund_requests where order_id=o.id and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Order has a refund hold'; end if;
 if o.subtotal<=0 or j.max_unit_cost*j.quantity> (select total_price from order_items where id=p_item_id)*greatest(o.subtotal-o.discount,0)/o.subtotal then raise exception 'Supplier cost exceeds net sale'; end if;
 if exists(select 1 from wupex_units where item_id=p_item_id and ordinal<p_ordinal and provider_status is distinct from 'success') then raise exception 'Complete the previous unit first'; end if;
 if coalesce(length(p_request),0) not between 10 and 100000 then raise exception 'Save the encrypted request first'; end if;
 update wupex_units set submitted_at=now(),request_ciphertext=p_request where item_id=p_item_id and ordinal=p_ordinal and submitted_at is null;
 if not found then raise exception 'This purchase was already submitted'; end if;
 update definiteplay_jobs set submitted_at=coalesce(submitted_at,now()),state='SUBMITTED',updated_at=now() where item_id=p_item_id;
end $$;

create function record_wupex_unit(p_item_id uuid,p_token uuid,p_ordinal integer,p_provider_id text,p_status text,p_amount numeric,p_result text)
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype;
begin
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() then raise exception 'Lease was lost'; end if;
 if coalesce(p_provider_id,'')!~'^[A-Za-z0-9_-]{1,100}$' or p_status is null or p_status not in ('in_process','success','error','cancel','refund','unknown') or coalesce(length(p_result),0) not between 10 and 100000 then raise exception 'Invalid supplier result'; end if;
 if p_status='success' and (p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount>(j.supplier_payload->>'supplierCost')::numeric) then raise exception 'Supplier charge requires review'; end if;
 update wupex_units set provider_id=p_provider_id,provider_status=p_status,charged_amount=p_amount,result_ciphertext=p_result
 where item_id=p_item_id and ordinal=p_ordinal and submitted_at is not null and (provider_id is null or provider_id=p_provider_id) and provider_status is distinct from 'success';
 if not found then raise exception 'Purchase result is already final or does not match'; end if;
end $$;

create function complete_wupex_job(p_item_id uuid,p_token uuid,p_codes text[])
returns void language plpgsql security definer set search_path=public as $$
declare j definiteplay_jobs%rowtype; o orders%rowtype; cost numeric;
begin
 select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='WUPEX' for update;
 if j.state='DELIVERED' then return; end if;
 if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.submitted_at is null then raise exception 'Lease was lost'; end if;
 if o.status not in ('PAID','PROCESSING') or o.paid_at is null or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) then raise exception 'Payment is not verified'; end if;
 if (select count(*) from wupex_units where item_id=p_item_id and provider_status='success' and charged_amount>0)<>j.quantity then raise exception 'Supplier has not confirmed every unit'; end if;
 if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') or exists(select 1 from order_refund_requests where order_id=o.id and status in ('REQUESTED','APPROVED','COMPLETED')) then raise exception 'Resolve the refund first'; end if;
 select ceil(sum(charged_amount)/(j.supplier_payload->>'exchangeRate')::numeric*100000000)/100000000 into cost from wupex_units where item_id=p_item_id;
 if cost is null or cost<=0 or cost>j.max_unit_cost*j.quantity then raise exception 'Supplier charge exceeds budget'; end if;
 if j.supplier_payload->>'deliveryKind'='CODE' then
  perform complete_definiteplay_job(p_item_id,p_token,p_codes,cost); return;
 end if;
 if j.supplier_payload->>'deliveryKind' is distinct from 'ACCOUNT' or cardinality(p_codes) is distinct from 0 or exists(select 1 from gift_card_codes where order_item_id=p_item_id) then raise exception 'Invalid account delivery'; end if;
 perform set_config('app.wupex_delivery',p_item_id::text,true);
 update order_items set service_delivered_at=now() where id=p_item_id and service_delivered_at is null;
 if not found then raise exception 'Item already delivered'; end if;
 update definiteplay_jobs set state='DELIVERED',actual_cost=cost,issue=null,lease_token=null,lease_until=null,updated_at=now() where item_id=p_item_id;
 if not exists(select 1 from order_items i where i.order_id=o.id and i.service_delivered_at is null and
  (select count(*) from gift_card_codes c where c.order_item_id=i.id and c.status='SOLD')+coalesce((select sum(r.quantity) from order_item_refunds r where r.order_item_id=i.id and r.status<>'CANCELLED'),0)<i.quantity) then
  update orders set status='DELIVERED',delivered_at=now(),updated_at=now() where id=o.id;
 else update orders set status='PROCESSING',updated_at=now() where id=o.id; end if;
end $$;

-- Freeze imported mappings/recipient forms while automatic delivery is enabled.
create function guard_wupex_configuration() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='WUPEX' and not exists(select 1 from wupex_delivery_settings where product_id=NEW.id) then raise exception 'Use the Wupex supplier tab first'; end if;
  if OLD.stock_source='WUPEX' and NEW.stock_source not in ('WUPEX','OWNED') then raise exception 'Disable Wupex delivery first'; end if;
 else
  pid:=case when TG_OP='INSERT' then NEW.product_id else OLD.product_id end;
  if exists(select 1 from products where id=pid and stock_source='WUPEX') then raise exception 'Disable Wupex delivery before changing supplier links or customer fields'; end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create trigger guard_wupex_source before update of stock_source on products for each row execute function guard_wupex_configuration();
create trigger guard_wupex_import before update or delete on wupex_imports for each row execute function guard_wupex_configuration();
create trigger guard_wupex_link before update or delete on wupex_product_links for each row execute function guard_wupex_configuration();
create trigger guard_wupex_customer_field before insert or update or delete on product_customer_fields for each row execute function guard_wupex_configuration();

revoke all on function configure_wupex_product(uuid,boolean,text,text),sync_wupex_stock(uuid,text,jsonb),snapshot_wupex_order_item(),mark_wupex_unit_submitted(uuid,uuid,integer,text),record_wupex_unit(uuid,uuid,integer,text,text,numeric,text),complete_wupex_job(uuid,uuid,text[]),guard_wupex_configuration() from public,anon,authenticated;
grant execute on function configure_wupex_product(uuid,boolean,text,text),sync_wupex_stock(uuid,text,jsonb),mark_wupex_unit_submitted(uuid,uuid,integer,text),record_wupex_unit(uuid,uuid,integer,text,text,numeric,text),complete_wupex_job(uuid,uuid,text[]) to service_role;

-- Keep the purchased denomination tied to its reviewed supplier SKU.
create function guard_wupex_option() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from wupex_product_links where option_id=OLD.id) and
   (TG_OP='DELETE' or NEW.product_id is distinct from OLD.product_id or NEW.denomination is distinct from OLD.denomination or
    NEW.denomination_currency is distinct from OLD.denomination_currency or NEW.is_custom_value is distinct from OLD.is_custom_value or
    NEW.option_type is distinct from OLD.option_type) then
  raise exception 'Import a new Wupex option instead of changing the linked denomination';
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create trigger guard_wupex_option before update or delete on product_options for each row execute function guard_wupex_option();
revoke all on function guard_wupex_option() from public,anon,authenticated;

notify pgrst,'reload schema';

-- 20261026_040000_wupex_pricing.sql
-- Keep supplier cost, selling price and funded availability in one transaction.
-- This does not submit purchases, publish drafts or enable automatic delivery.

alter table public.wupex_imports add column if not exists pricing_synced_at timestamptz not null default 'epoch';
create index if not exists wupex_imports_pricing_due on public.wupex_imports(connection_id,pricing_synced_at);

create or replace function public.guard_wupex_configuration() returns trigger
language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
 if TG_TABLE_NAME='products' then
  if NEW.stock_source='WUPEX' and not exists(select 1 from wupex_delivery_settings where product_id=NEW.id) then raise exception 'Use the Wupex supplier tab first'; end if;
  if OLD.stock_source='WUPEX' and NEW.stock_source not in ('WUPEX','OWNED') then raise exception 'Disable Wupex delivery first'; end if;
 else
  pid:=case when TG_OP='INSERT' then NEW.product_id else OLD.product_id end;
  if exists(select 1 from products where id=pid and stock_source='WUPEX') then
   -- Only the catalogue RPC may refresh cost metadata. Mappings and customer
   -- fields stay frozen, including while customer orders are in progress.
   if TG_OP='UPDATE' and TG_TABLE_NAME='wupex_imports' and coalesce(current_setting('app.wupex_markup',true),'')=pid::text and (to_jsonb(NEW)-'markup_percent')=(to_jsonb(OLD)-'markup_percent') then return NEW; end if;
   if TG_OP='UPDATE' and coalesce(current_setting('app.wupex_catalogue_sync',true),'')=pid::text then
    if TG_TABLE_NAME='wupex_product_links' and
     (to_jsonb(NEW)-array['supplier_cost','supplier_snapshot'])=(to_jsonb(OLD)-array['supplier_cost','supplier_snapshot']) then return NEW; end if;
    if TG_TABLE_NAME='wupex_imports' and
     (to_jsonb(NEW)-'pricing_synced_at')=(to_jsonb(OLD)-'pricing_synced_at') then return NEW; end if;
   end if;
   raise exception 'Disable Wupex delivery before changing supplier links or customer fields';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;

create or replace function public.sync_wupex_catalogue(p_product_id uuid,p_connection text,p_rows jsonb,p_synced_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare p products%rowtype; imp wupex_imports%rowtype; r record; facts jsonb;
 cost numeric; price numeric; qty integer; stock_rows jsonb:='[]'; changed integer:=0;
 previous_guard text:=coalesce(current_setting('app.wupex_catalogue_sync',true),'');
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 or
  p_synced_at is null or p_synced_at>clock_timestamp()+interval '1 minute' or p_synced_at<clock_timestamp()-interval '5 minutes' then raise exception 'Invalid Wupex catalogue snapshot'; end if;
 select * into p from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id for update;
 if p.id is null or imp.product_id is null or imp.connection_id is distinct from p_connection then raise exception 'Invalid Wupex product connection'; end if;
 -- A late request cannot overwrite a newer supplier snapshot.
 if p_synced_at<imp.pricing_synced_at then return 0; end if;
 if p.seller_id is not null or p.stock_source not in ('OWNED','WUPEX') then
  update wupex_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
  return 0;
 end if;
 if imp.exchange_rate is null or imp.exchange_rate<=0 or imp.exchange_rate>100000000 or
  imp.markup_percent is null or imp.markup_percent not between 0 and 1000 then raise exception 'Invalid Wupex pricing settings'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)x where jsonb_typeof(x)<>'object' or
   not exists(select 1 from wupex_product_links l where l.product_id=p_product_id and l.option_id::text=x->>'optionId' and l.connection_id=p_connection)) or
  (select count(distinct x->>'optionId') from jsonb_array_elements(p_rows)x)<>jsonb_array_length(p_rows) then raise exception 'Invalid Wupex option mapping'; end if;
 perform set_config('app.wupex_catalogue_sync',p_product_id::text,true);
 for r in select l.*,o.is_active,o.is_custom_value,o.selling_price from wupex_product_links l
  join product_options o on o.id=l.option_id and o.product_id=l.product_id
  where l.product_id=p_product_id and l.connection_id=p_connection order by l.option_id for update of l,o
 loop
  select value into facts from jsonb_array_elements(p_rows) where value->>'optionId'=r.option_id::text;
  qty:=0;
  if facts is not null then
   if coalesce(facts->>'quantity','')!~'^[0-9]{1,4}$' or (facts->>'quantity')::integer>1000 then raise exception 'Invalid Wupex quantity'; end if;
   qty:=(facts->>'quantity')::integer;
   if facts ? 'supplierCost' then
    if facts->>'supplierId' is distinct from r.supplier_product_id::text or facts->>'supplierCurrency' is distinct from r.supplier_currency or
     coalesce(facts->>'supplierCost','')!~'^[0-9]{1,9}([.][0-9]{1,8})?$' or r.is_custom_value then raise exception 'Invalid Wupex supplier price'; end if;
    cost:=(facts->>'supplierCost')::numeric;
    if cost<=0 or cost>100000000 then raise exception 'Invalid Wupex supplier price'; end if;
    -- Numeric arithmetic matches fkSellingPrice: round half up once, in USD.
    price:=round(cost/imp.exchange_rate*(1+imp.markup_percent/100),2);
    if price<0.01 or price>9999999.99 then raise exception 'Invalid Wupex selling price'; end if;
    update wupex_product_links set supplier_cost=cost,supplier_snapshot=jsonb_set(supplier_snapshot,'{price}',to_jsonb(cost),true)
     where option_id=r.option_id and supplier_cost is distinct from cost;
    update product_options set selling_price=price,updated_at=now() where id=r.option_id and selling_price is distinct from price;
    if p.stock_source='WUPEX' then
     update definiteplay_stock set unit_cost=ceil(cost/imp.exchange_rate*100000000)/100000000
      where option_id=r.option_id and product_id=p_product_id and sku='WX'||r.supplier_product_id and currency='USD';
     if not found then raise exception 'Wupex delivery cost link is missing'; end if;
    end if;
    if r.supplier_cost is distinct from cost or r.selling_price is distinct from price then changed:=changed+1; end if;
   elsif qty<>0 then raise exception 'Wupex availability requires a valid supplier price';
   end if;
  end if;
  stock_rows:=stock_rows||jsonb_build_array(jsonb_build_object('optionId',r.option_id,'quantity',case when r.is_active and not r.is_custom_value then qty else 0 end));
 end loop;
 -- The existing function never changes stock for drafts/manual products.
 if p.stock_source='WUPEX' then perform sync_wupex_stock(p_product_id,p_connection,stock_rows); end if;
 update wupex_imports set pricing_synced_at=p_synced_at where product_id=p_product_id;
 update products set price=(select min(selling_price) from product_options where product_id=p_product_id and is_active),updated_at=now() where id=p_product_id;
 perform set_config('app.wupex_catalogue_sync',previous_guard,true);
 return changed;
end $$;
revoke all on function public.sync_wupex_catalogue(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_wupex_catalogue(uuid,text,jsonb,timestamptz) to service_role;
-- Hold the selected cost link while a new website order snapshots its budget.
-- An overlapping catalogue refresh can then supply either the old complete
-- snapshot or the new complete snapshot, never mixed cost/currency metadata.
do $$ declare source text; needle text := 'select * into link from wupex_product_links where option_id=NEW.product_option_id and product_id=NEW.product_id and connection_id=imp.connection_id;'; begin
 source:=pg_get_functiondef('public.snapshot_wupex_order_item()'::regprocedure);
 if position(needle in source)>0 then
  execute replace(source,needle,replace(needle,';',' for share;'));
 elsif position(replace(needle,';',' for share;') in source)=0 then
  raise exception 'Unrecognised Wupex order snapshot function';
 end if;
end $$;

-- Changing markup updates all saved prices atomically, without altering old orders.
create function set_wupex_markup(p_product_id uuid,p_connection text,p_markup numeric)
returns void language plpgsql security definer set search_path=public as $$
declare imp wupex_imports%rowtype; saved_guard text:=coalesce(current_setting('app.wupex_markup',true),''); begin
 if p_markup is null or p_markup::text in ('NaN','Infinity','-Infinity') or p_markup not between 0 and 1000 or round(p_markup,2)<>p_markup then raise exception 'Invalid markup'; end if;
 perform 1 from products where id=p_product_id for update;
 select * into imp from wupex_imports where product_id=p_product_id and connection_id=p_connection for update;
 if not found then raise exception 'Invalid Wupex connection'; end if;
 perform set_config('app.wupex_markup',p_product_id::text,true);
 update wupex_imports set markup_percent=p_markup where product_id=p_product_id;
 if exists(select 1 from wupex_product_links where product_id=p_product_id and round(supplier_cost/imp.exchange_rate*(1+p_markup/100),2) not between 0.01 and 9999999.99) then raise exception 'Invalid selling price'; end if;
 update product_options o set selling_price=round(l.supplier_cost/imp.exchange_rate*(1+p_markup/100),2),updated_at=now() from wupex_product_links l where l.product_id=p_product_id and l.option_id=o.id and o.product_id=p_product_id;
 update products set price=(select min(selling_price) from product_options where product_id=p_product_id and is_active),updated_at=now() where id=p_product_id;
 perform set_config('app.wupex_markup',saved_guard,true);
end $$;
revoke all on function set_wupex_markup(uuid,text,numeric) from public,anon,authenticated;
grant execute on function set_wupex_markup(uuid,text,numeric) to service_role;
notify pgrst,'reload schema';

$wupex_bundle$;
 insert into public.wupex_installation_state(version) values(1);
end $wupex_install$;
commit;
