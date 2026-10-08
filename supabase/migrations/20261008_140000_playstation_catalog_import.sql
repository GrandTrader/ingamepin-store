-- Additive only. Apply after existing product/customer-information migrations.
begin;
alter table public.products add column if not exists catalog_sku text;
alter table public.product_options add column if not exists catalog_sku text;
alter table public.product_options add column if not exists catalog_source jsonb;
create unique index if not exists products_catalog_sku_key on public.products(catalog_sku) where catalog_sku is not null;
create unique index if not exists product_options_catalog_sku_key on public.product_options(catalog_sku) where catalog_sku is not null;

create table if not exists public.product_import_settings (
  id boolean primary key default true check(id),
  markup_percent numeric(7,2) not null default 20 check(markup_percent between 0 and 1000),
  inr_per_usd numeric(12,4) not null default 98 check(inr_per_usd > 0 and inr_per_usd <= 10000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.product_import_settings(id) values(true) on conflict do nothing;
create table if not exists public.product_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_by_email text not null,
  filename text not null check(length(filename) <= 160),
  settings jsonb not null,
  plan jsonb not null check(jsonb_typeof(plan)='array' and jsonb_array_length(plan) between 1 and 2000),
  rejected_rows jsonb not null default '[]',
  status text not null default 'RUNNING' check(status in ('RUNNING','COMPLETED','ROLLED_BACK','PARTIAL_ROLLBACK')),
  created_at timestamptz not null default now()
);
create table if not exists public.product_import_items (
  run_id uuid not null references public.product_import_runs(id),
  item_index integer not null,
  parent_sku text not null,
  product_id uuid references public.products(id) on delete set null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  status text not null check(status in ('CREATED','UPDATED','REJECTED','UNDONE','PROTECTED')),
  message text,
  updated_at timestamptz not null default now(),
  primary key(run_id,item_index), unique(run_id,parent_sku)
);
alter table public.product_import_settings enable row level security;
alter table public.product_import_runs enable row level security;
alter table public.product_import_items enable row level security;
revoke all on public.product_import_settings,public.product_import_runs,public.product_import_items from public,anon,authenticated;
grant all on public.product_import_settings,public.product_import_runs,public.product_import_items to service_role;

create or replace function public.catalog_product_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('product',to_jsonb(p),
    'options',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from product_options o where o.product_id=p.id),'[]'),
    'fields',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from product_customer_fields f where f.product_id=p.id),'[]'))
  from products p where p.id=p_id;
$$;
create or replace function public.catalog_import_snapshots(p_skus text[])
returns table(sku text,snapshot jsonb) language sql stable security definer set search_path=public as $$
  select s, catalog_product_snapshot(p.id) from unnest(p_skus) s left join products p on p.catalog_sku=s;
$$;

create or replace function public.apply_catalog_import_item(p_run uuid,p_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r product_import_runs; g jsonb; patch jsonb; e jsonb; existing product_import_items;
  p products; o product_options; v_product_id uuid; v_option_id uuid; before_value jsonb; after_value jsonb; result_status text; err text;
begin
  select * into r from product_import_runs where id=p_run for update;
  if not found or r.status not in ('RUNNING','COMPLETED') then raise exception 'Import is unavailable or already undone.'; end if;
  if p_index < 0 or p_index >= jsonb_array_length(r.plan) then raise exception 'Invalid import position.'; end if;
  select * into existing from product_import_items where run_id=p_run and item_index=p_index;
  if found then return jsonb_build_object('sku',existing.parent_sku,'status',existing.status,'message',existing.message,'productId',existing.product_id); end if;
  g:=r.plan->p_index;
  perform pg_advisory_xact_lock(hashtextextended(g->>'parent_sku',417));
  begin
    select * into p from products where catalog_sku=g->>'parent_sku' for update;
    v_product_id:=p.id;
    perform 1 from product_options where product_id=v_product_id for update;
    perform 1 from product_customer_fields where product_id=v_product_id for update;
    before_value:=catalog_product_snapshot(v_product_id);
    if before_value is distinct from nullif(g->'expected','null'::jsonb) then raise exception 'Product changed after preview. Preview this file again.'; end if;
    patch:=g->'product';
    if v_product_id is null then
      insert into products(catalog_sku,category_id,name,name_ru,slug,description,description_ru,region,product_type,delivery_type,status,currency,stock_quantity,minimum_quantity,maximum_quantity,requires_customer_details,allows_gaming_voucher,is_bulk_order)
      values(g->>'parent_sku',(patch->>'category_id')::uuid,patch->>'name',patch->>'name_ru',patch->>'slug',patch->>'description',patch->>'description_ru','India',patch->>'product_type','MANUAL','DRAFT','USD',2147483647,1,1,true,false,false) returning products.id into v_product_id;
      result_status:='CREATED';
    else
      result_status:='UPDATED';
    end if;
    update products set
      name=case when patch?'name' then patch->>'name' else name end,
      name_ru=case when patch?'name_ru' then patch->>'name_ru' else name_ru end,
      slug=case when patch?'slug' then patch->>'slug' else slug end,
      description=case when patch?'description' then patch->>'description' else description end,
      description_ru=case when patch?'description_ru' then patch->>'description_ru' else description_ru end,
      image_url=case when patch?'image_url' then patch->>'image_url' else image_url end,
      category_id=case when patch?'category_id' then (patch->>'category_id')::uuid else category_id end,
      product_type=case when patch?'product_type' then patch->>'product_type' else product_type end,
      delivery_instructions=case when patch?'delivery_instructions' then patch->>'delivery_instructions' else delivery_instructions end,
      is_featured=case when patch?'is_featured' then (patch->>'is_featured')::boolean else is_featured end,
      affiliate_enabled=case when patch?'affiliate_enabled' then (patch->>'affiliate_enabled')::boolean else affiliate_enabled end,
      affiliate_commission_percent=case when patch?'affiliate_commission_percent' then (patch->>'affiliate_commission_percent')::numeric else affiliate_commission_percent end,
      affiliate_updated_at=case when patch?'affiliate_enabled' or patch?'affiliate_commission_percent' then clock_timestamp() else affiliate_updated_at end,
      updated_at=clock_timestamp() where products.id=v_product_id;
    for e in select value from jsonb_array_elements(g->'editions') loop
      select * into o from product_options where catalog_sku=e->>'sku' for update;
      if found and o.product_id<>v_product_id then raise exception 'Edition SKU already belongs to another product.'; end if;
      v_option_id:=o.id;
      if v_option_id is null then
        insert into product_options(product_id,category_id,catalog_sku,option_name,option_type,platform,denomination,denomination_currency,selling_price,stock_quantity,is_active,is_in_stock,is_custom_value,sort_order,catalog_source)
        values(v_product_id,(select category_id from products where products.id=v_product_id),e->>'sku',e->>'option_name','OTHER',e->>'platform',nullif(e->'source'->>'store_price_inr','')::numeric,'INR',(e->>'price')::numeric,2147483647,true,(e->>'is_in_stock')::boolean,false,(e->>'sort_order')::integer,e->'source') returning product_options.id into v_option_id;
      else
        update product_options set option_name=coalesce(e->>'option_name',option_name),platform=coalesce(e->>'platform',platform),
          selling_price=coalesce((e->>'price')::numeric,selling_price),catalog_source=e->'source',
          denomination=case when e->'source'->>'store_price_inr' is distinct from o.catalog_source->>'store_price_inr' then nullif(e->'source'->>'store_price_inr','')::numeric else denomination end,
          is_in_stock=(e->>'is_in_stock')::boolean,updated_at=clock_timestamp() where product_options.id=v_option_id;
      end if;
    end loop;
    if result_status='CREATED' or coalesce((g->>'customer_fields')::boolean,false) then
      for e in select value from jsonb_array_elements('[{"label":"PlayStation account email","type":"EMAIL","placeholder":"Email used for your Indian PlayStation account"},{"label":"PSN Online ID","type":"TEXT","placeholder":"Your public PlayStation Online ID"}]'::jsonb) loop
        if exists(select 1 from product_customer_fields where product_id=v_product_id and label=e->>'label') then
          update product_customer_fields set is_required=true,field_type=e->>'type',updated_at=clock_timestamp() where product_id=v_product_id and label=e->>'label';
        else
          insert into product_customer_fields(product_id,label,placeholder,field_type,is_required,sort_order)
          values(v_product_id,e->>'label',e->>'placeholder',e->>'type',true,(select count(*) from product_customer_fields where product_id=v_product_id));
        end if;
      end loop;
      update products set requires_customer_details=true where products.id=v_product_id;
    end if;
    if result_status='CREATED' then
      update products set gaming_platforms=array(select distinct part from product_options,unnest(string_to_array(platform,'/')) part where product_id=v_product_id and part in ('PS4','PS5') order by part) where products.id=v_product_id;
    end if;
    update products set price=coalesce((select min(selling_price) from product_options where product_id=v_product_id and is_active and selling_price>0),0),updated_at=clock_timestamp() where products.id=v_product_id;
    after_value:=catalog_product_snapshot(v_product_id);
    insert into product_import_items(run_id,item_index,parent_sku,product_id,before_snapshot,after_snapshot,status)
    values(p_run,p_index,g->>'parent_sku',v_product_id,before_value,after_value,result_status);
  exception when others then
    get stacked diagnostics err=message_text;
    result_status:='REJECTED'; v_product_id:=null;
    insert into product_import_items(run_id,item_index,parent_sku,status,message) values(p_run,p_index,g->>'parent_sku','REJECTED',left(err,400));
  end;
  if (select count(*) from product_import_items where run_id=p_run)=jsonb_array_length(r.plan) then update product_import_runs set status='COMPLETED' where product_import_runs.id=p_run; end if;
  return jsonb_build_object('sku',g->>'parent_sku','status',result_status,'message',err,'productId',v_product_id);
end; $$;

create or replace function public.undo_catalog_import_item(p_run uuid,p_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r product_import_runs; i product_import_items; b jsonb; rec jsonb; p products; o product_options; f product_customer_fields;
begin
  select * into r from product_import_runs where id=p_run for update;
  if not found then raise exception 'Import not found.'; end if;
  if (select count(*) from product_import_items where run_id=p_run)<jsonb_array_length(r.plan) then raise exception 'Finish the import before undoing it.'; end if;
  select * into i from product_import_items where run_id=p_run and item_index=p_index for update;
  if not found then raise exception 'Import item not found.'; end if;
  if i.status in ('UNDONE','REJECTED','PROTECTED') then return jsonb_build_object('sku',i.parent_sku,'status',i.status,'message',i.message); end if;
  perform pg_advisory_xact_lock(hashtextextended(i.parent_sku,417));
  perform 1 from products where id=i.product_id for update;
  -- Lock children as well; later manual edits, stock changes and orders are preserved.
  perform 1 from product_options where product_id=i.product_id for update;
  perform 1 from product_customer_fields where product_id=i.product_id for update;
  if catalog_product_snapshot(i.product_id) is distinct from i.after_snapshot
    or exists(select 1 from order_items where product_id=i.product_id) then
    update product_import_items set status='PROTECTED',message='Later changes or orders exist. Product was preserved.',updated_at=clock_timestamp() where run_id=p_run and item_index=p_index;
    update product_import_runs set status='PARTIAL_ROLLBACK' where id=p_run;
    return jsonb_build_object('sku',i.parent_sku,'status','PROTECTED','message','Later changes or orders exist. Product was preserved.');
  end if;
  b:=i.before_snapshot;
  if b is null then
    delete from products where id=i.product_id and status='DRAFT';
    if not found then raise exception 'Only unchanged draft products may be removed.'; end if;
  else
    p:=jsonb_populate_record(null::products,b->'product');
    delete from product_options where product_id=i.product_id and id not in (select (value->>'id')::uuid from jsonb_array_elements(b->'options'));
    for rec in select value from jsonb_array_elements(b->'options') loop
      o:=jsonb_populate_record(null::product_options,rec);
      update product_options set option_name=o.option_name,platform=o.platform,denomination=o.denomination,selling_price=o.selling_price,catalog_source=o.catalog_source,is_in_stock=o.is_in_stock,updated_at=o.updated_at where id=o.id;
    end loop;
    delete from product_customer_fields where product_id=i.product_id and id not in (select (value->>'id')::uuid from jsonb_array_elements(b->'fields'));
    for rec in select value from jsonb_array_elements(b->'fields') loop
      f:=jsonb_populate_record(null::product_customer_fields,rec);
      update product_customer_fields set is_required=f.is_required,field_type=f.field_type,updated_at=f.updated_at where id=f.id;
    end loop;
    update products set name=p.name,name_ru=p.name_ru,slug=p.slug,description=p.description,description_ru=p.description_ru,
      image_url=p.image_url,category_id=p.category_id,product_type=p.product_type,requires_customer_details=p.requires_customer_details,
      delivery_instructions=p.delivery_instructions,is_featured=p.is_featured,affiliate_enabled=p.affiliate_enabled,
      affiliate_commission_percent=p.affiliate_commission_percent,affiliate_updated_at=p.affiliate_updated_at,
      price=p.price,updated_at=p.updated_at where id=p.id;
  end if;
  update product_import_items set status='UNDONE',updated_at=clock_timestamp() where run_id=p_run and item_index=p_index;
  update product_import_runs set status=case when exists(select 1 from product_import_items where run_id=p_run and status in ('CREATED','UPDATED','PROTECTED')) then 'PARTIAL_ROLLBACK' else 'ROLLED_BACK' end where id=p_run;
  return jsonb_build_object('sku',i.parent_sku,'status','UNDONE');
end; $$;

create or replace function public.guard_catalog_purchase()
returns trigger language plpgsql security definer set search_path=public as $$
declare source jsonb;
begin
  select catalog_source into source from product_options where id=new.product_option_id;
  if source is null then return new; end if;
  if coalesce(source->>'availability','UNVERIFIED') not in ('AVAILABLE','PREORDER')
    or coalesce((source->>'store_price_inr')::numeric,0)<=0
    or nullif(source->>'store_url','') is null or nullif(source->>'price_checked_at','') is null then
    raise exception 'This edition needs a verified PlayStation Store price before purchase.';
  end if;
  if nullif(source->>'sale_ends_at','')::timestamptz<=clock_timestamp() then
    raise exception 'This edition sale has expired. Please contact support while its price is refreshed.';
  end if;
  return new;
end; $$;
drop trigger if exists catalog_purchase_guard on public.order_items;
create trigger catalog_purchase_guard before insert on public.order_items for each row execute function public.guard_catalog_purchase();
revoke all on function public.catalog_product_snapshot(uuid),public.catalog_import_snapshots(text[]),public.apply_catalog_import_item(uuid,integer),public.undo_catalog_import_item(uuid,integer),public.guard_catalog_purchase() from public,anon,authenticated;
grant execute on function public.catalog_product_snapshot(uuid),public.catalog_import_snapshots(text[]),public.apply_catalog_import_item(uuid,integer),public.undo_catalog_import_item(uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
