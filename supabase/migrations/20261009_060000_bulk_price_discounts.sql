begin;
-- Price imports share the existing resumable import history, but never create products.
create or replace function public.bulk_price_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'product',jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'currency',p.currency,'status',p.status,'stock_source',p.stock_source,'updated_at',p.updated_at),
  'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'option_name',o.option_name,'selling_price',o.selling_price,'is_custom_value',o.is_custom_value,'is_active',o.is_active,'catalog_source',o.catalog_source,'updated_at',o.updated_at) order by o.id) from product_options o where o.product_id=p.id),'[]'),
  'promotion',(select to_jsonb(pr) from product_promotions pr where pr.product_id=p.id),
  'range_options',coalesce((select jsonb_agg(r.option_id order by r.option_id) from product_range_settings r where r.product_id=p.id),'[]'),
  'seller_managed',exists(select 1 from seller_product_submissions s where s.product_id=p.id))
 from products p where p.id=p_id;
$$;
create or replace function public.bulk_price_snapshots(p_ids uuid[])
returns table(id uuid,snapshot jsonb) language sql stable security definer set search_path=public as $$
 select value,bulk_price_snapshot(value) from unnest(p_ids) value;
$$;

create or replace function public.apply_bulk_price_import_item(p_run uuid,p_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r product_import_runs; i product_import_items; g jsonb; entry jsonb; rules jsonb; rule jsonb;
 pid uuid; oid uuid; previous jsonb; after_value jsonb; revision_value uuid; pct numeric; expiry timestamptz;
 price_value numeric; check_time timestamptz; regular_inr numeric; source_url text; seen uuid[]:='{}';
 state text:='UPDATED'; err text; o product_options;
begin
 select * into r from product_import_runs where id=p_run for update;
 if not found or r.settings->>'mode' is distinct from 'prices' or r.status not in ('RUNNING','COMPLETED') then raise exception 'Price import is unavailable or already undone.'; end if;
 if not exists(select 1 from admin_users where user_id=r.created_by) then raise exception 'Administrator access is required.'; end if;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(r.plan) then raise exception 'Invalid import position.'; end if;
 select * into i from product_import_items where run_id=p_run and item_index=p_index;
 if found then return jsonb_build_object('sku',i.parent_sku,'status',i.status,'message',i.message,'productId',i.product_id); end if;
 g:=r.plan->p_index;
 begin
  pid:=(g->>'product_id')::uuid;
  perform 1 from products where id=pid for update;
  if not found then raise exception 'Product not found. No new products are created by this upload.'; end if;
  perform 1 from product_options where product_id=pid order by id for update;
  perform 1 from product_promotions where product_id=pid for update;
  perform 1 from product_range_settings where product_id=pid for update;
  previous:=bulk_price_snapshot(pid);
  if previous is distinct from g->'expected' then raise exception 'Price or discount settings changed after preview. Preview the file again.'; end if;
  if (previous->>'seller_managed')::boolean then raise exception 'Seller-managed listings cannot use this uploader.'; end if;
  if previous->'product'->>'currency' is distinct from 'USD' then raise exception 'This uploader requires USD product prices.'; end if;
  if jsonb_typeof(g->'rows') is distinct from 'array' or jsonb_array_length(g->'rows')<1 or jsonb_array_length(g->'rows')>2000 then raise exception 'Invalid price rows.'; end if;
  rules:=coalesce(nullif(previous->'promotion','null'::jsonb)->'rules','[]'::jsonb);
  revision_value:=(previous->'promotion'->>'revision')::uuid;
  for entry in select value from jsonb_array_elements(g->'rows') loop
   oid:=(entry->>'optionId')::uuid;
   if oid is null or oid=any(seen) or (entry->>'productId')::uuid is distinct from pid then raise exception 'Invalid or duplicated product option.'; end if;
   seen:=array_append(seen,oid);
   select * into o from product_options where id=oid and product_id=pid;
   if not found then raise exception 'The denomination does not belong to this product.'; end if;
   if o.is_custom_value or exists(select 1 from product_range_settings where option_id=oid) then raise exception 'Use the range editor for variable-value options.'; end if;
   if not(entry ? 'price') and not(entry ? 'rule') then raise exception 'Each row needs a price or discount.'; end if;
   if entry ? 'price' then
    if coalesce(entry->>'price','') !~ '^[0-9]{1,7}([.][0-9]{1,2})?$' then raise exception 'Invalid regular price.'; end if;
    price_value:=(entry->>'price')::numeric;
    if price_value<0.01 or price_value>1000000 then raise exception 'Regular price must be from 0.01 to 1000000 USD.'; end if;
    update product_options set selling_price=price_value,updated_at=clock_timestamp() where id=oid;
   end if;
   if entry ? 'source' then
    source_url:=entry->'source'->>'store_url';
    if not(entry ? 'price') or o.catalog_source is null or coalesce(o.catalog_source->>'availability','') not in ('AVAILABLE','PREORDER') then raise exception 'Store verification needs an existing verified catalogue option and a regular USD price.'; end if;
    if source_url is distinct from o.catalog_source->>'store_url' or source_url !~* '^https://(store[.]playstation[.]com/en-in/(product/[a-z0-9_-]+|concept/[0-9]+)|www[.]xbox[.]com/en-in/games/store/[a-z0-9-]+/[a-z0-9]{12})/?$' then raise exception 'The official edition source does not match.'; end if;
    if coalesce(entry->'source'->>'store_price_inr','') !~ '^[0-9]{1,7}([.][0-9]{1,2})?$' then raise exception 'Invalid regular INR store price.'; end if;
    regular_inr:=(entry->'source'->>'store_price_inr')::numeric;
    check_time:=(entry->'source'->>'price_checked_at')::timestamptz;
    if regular_inr<=0 or regular_inr>1000000 or check_time is null or not isfinite(check_time) or check_time>clock_timestamp()+interval '5 minutes' or check_time<clock_timestamp()-interval '7 days' then raise exception 'A fresh regular store price is required.'; end if;
    update product_options set catalog_source=o.catalog_source || jsonb_build_object('store_price_inr',regular_inr::text,'price_checked_at',check_time,'sale_ends_at',''),updated_at=clock_timestamp() where id=oid;
   end if;
   if entry ? 'rule' then
    rule:=entry->'rule';
    if (rule->>'optionId')::uuid is distinct from oid or coalesce(rule->>'percent','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Invalid discount.'; end if;
    pct:=(rule->>'percent')::numeric; expiry:=nullif(rule->>'endsAt','')::timestamptz;
    if pct<0 or pct>=100 then raise exception 'Discount must be from 0 to 99.99 percent.'; end if;
    if pct>0 and (expiry is null or not isfinite(expiry) or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '10 years') then raise exception 'Discount expired before import or has an invalid expiry. Preview fresh prices.'; end if;
    if pct=0 and expiry is not null then raise exception 'A zero discount must have no expiry.'; end if;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into rules from jsonb_array_elements(rules) where value->>'optionId' is distinct from oid::text;
    rules:=rules || jsonb_build_array(jsonb_build_object('optionId',oid,'percent',pct,'endsAt',expiry));
   end if;
  end loop;
  if rules is distinct from coalesce(previous->'promotion'->'rules','[]'::jsonb) then perform save_product_promotions(pid,r.created_by,revision_value,rules); end if;
  update products set price=coalesce((select min(selling_price) from product_options where product_id=pid and is_active and selling_price>0),price),updated_at=clock_timestamp() where id=pid;
  after_value:=bulk_price_snapshot(pid);
  insert into product_import_items(run_id,item_index,parent_sku,product_id,before_snapshot,after_snapshot,status)
  values(p_run,p_index,pid::text,pid,previous,after_value,'UPDATED');
 exception when others then
  get stacked diagnostics err=message_text; state:='REJECTED'; pid:=null;
  insert into product_import_items(run_id,item_index,parent_sku,status,message) values(p_run,p_index,g->>'parent_sku','REJECTED',left(err,400));
 end;
 if (select count(*) from product_import_items where run_id=p_run)=jsonb_array_length(r.plan) then update product_import_runs set status='COMPLETED' where id=p_run; end if;
 return jsonb_build_object('sku',g->>'parent_sku','status',state,'message',err,'productId',pid);
end $$;

create or replace function public.undo_bulk_price_import_item(p_run uuid,p_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r product_import_runs; i product_import_items; entry jsonb; old jsonb;
begin
 select * into r from product_import_runs where id=p_run for update;
 if not found or r.settings->>'mode' is distinct from 'prices' then raise exception 'Price import not found.'; end if;
 if not exists(select 1 from admin_users where user_id=r.created_by) then raise exception 'Administrator access is required.'; end if;
 if (select count(*) from product_import_items where run_id=p_run)<jsonb_array_length(r.plan) then raise exception 'Finish this import before undoing it.'; end if;
 select * into i from product_import_items where run_id=p_run and item_index=p_index for update;
 if not found then raise exception 'Import item not found.'; end if;
 if i.status in ('UNDONE','REJECTED','PROTECTED') then return jsonb_build_object('sku',i.parent_sku,'status',i.status,'message',i.message); end if;
 perform 1 from products where id=i.product_id for update;
 perform 1 from product_options where product_id=i.product_id order by id for update;
 perform 1 from product_promotions where product_id=i.product_id for update;
 perform 1 from product_range_settings where product_id=i.product_id for update;
 if bulk_price_snapshot(i.product_id) is distinct from i.after_snapshot or exists(select 1 from order_items where product_id=i.product_id) then
  update product_import_items set status='PROTECTED',message='Later changes or orders exist. Prices were preserved.',updated_at=clock_timestamp() where run_id=p_run and item_index=p_index;
 else
  old:=i.before_snapshot;
  for entry in select value from jsonb_array_elements(old->'options') loop
   update product_options set selling_price=(entry->>'selling_price')::numeric,catalog_source=nullif(entry->'catalog_source','null'::jsonb),updated_at=(entry->>'updated_at')::timestamptz where id=(entry->>'id')::uuid and product_id=i.product_id;
  end loop;
  if old->'promotion'='null'::jsonb then delete from product_promotions where product_id=i.product_id;
  else
   insert into product_promotions(product_id,rules,revision,updated_at) values(i.product_id,old->'promotion'->'rules',(old->'promotion'->>'revision')::uuid,(old->'promotion'->>'updated_at')::timestamptz)
   on conflict(product_id) do update set rules=excluded.rules,revision=excluded.revision,updated_at=excluded.updated_at;
  end if;
  update products set price=(old->'product'->>'price')::numeric,updated_at=(old->'product'->>'updated_at')::timestamptz where id=i.product_id;
  update product_import_items set status='UNDONE',updated_at=clock_timestamp() where run_id=p_run and item_index=p_index;
 end if;
 update product_import_runs set status=case when exists(select 1 from product_import_items where run_id=p_run and status in ('UPDATED','PROTECTED')) then 'PARTIAL_ROLLBACK' else 'ROLLED_BACK' end where id=p_run;
 select * into i from product_import_items where run_id=p_run and item_index=p_index;
 return jsonb_build_object('sku',i.parent_sku,'status',i.status,'message',i.message);
end $$;
revoke all on function public.bulk_price_snapshot(uuid),public.bulk_price_snapshots(uuid[]),public.apply_bulk_price_import_item(uuid,integer),public.undo_bulk_price_import_item(uuid,integer) from public,anon,authenticated;
grant execute on function public.bulk_price_snapshot(uuid),public.bulk_price_snapshots(uuid[]),public.apply_bulk_price_import_item(uuid,integer),public.undo_bulk_price_import_item(uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
