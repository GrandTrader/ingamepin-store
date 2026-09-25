-- Correct the supplier-mode guard to use supported order_status values.
-- This changes the function only; it does not enable products or place orders.
begin;

create or replace function public.configure_definiteplay_product(p_product_id uuid,p_enabled boolean,p_mappings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_product public.products%rowtype; r jsonb;
begin
  select * into v_product from products where id=p_product_id for update;
  if not found or v_product.seller_id is not null then raise exception 'Invalid store product'; end if;
  if exists(select 1 from definiteplay_jobs j join order_items i on i.id=j.item_id join orders o on o.id=j.order_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then
    raise exception 'Resolve existing supplier orders before changing supplier mode or links';
  end if;
  if not p_enabled then
    update products set stock_source='OWNED' where id=p_product_id;
    delete from definiteplay_stock where product_id=p_product_id;
    perform reconcile_code_inventory(p_product_id);
    return;
  end if;
  if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then
    raise exception 'This product already has owned or reserved codes; use a separate supplier product';
  end if;
  if v_product.allows_custom_value or v_product.allows_player_id_topup then raise exception 'Supplier delivery supports fixed code options only'; end if;
  if p_mappings is null or jsonb_typeof(p_mappings)<>'array' or jsonb_array_length(p_mappings)<1 or jsonb_array_length(p_mappings)>50 then raise exception 'Invalid supplier links'; end if;
  if (select count(distinct x->>'optionId') from jsonb_array_elements(p_mappings) x)<>jsonb_array_length(p_mappings) then raise exception 'Duplicate options'; end if;
  for r in select value from jsonb_array_elements(p_mappings) loop
    if not exists(select 1 from product_options where id=(r->>'optionId')::uuid and product_id=p_product_id) then raise exception 'Option belongs to another product'; end if;
    if coalesce(r->>'sku','')!~'^[A-Za-z0-9._-]{1,100}$' then raise exception 'Invalid supplier SKU'; end if;
  end loop;
  if exists(select 1 from product_options o where o.product_id=p_product_id and o.is_active and not exists(select 1 from jsonb_array_elements(p_mappings) x where (x->>'optionId')::uuid=o.id)) then raise exception 'Link every active option first'; end if;
  delete from definiteplay_stock where product_id=p_product_id;
  insert into definiteplay_stock(option_id,product_id,sku)
    select (x->>'optionId')::uuid,p_product_id,x->>'sku' from jsonb_array_elements(p_mappings) x;
  update products set stock_source='DEFINITEPLAY',delivery_type='MANUAL',stock_quantity=0 where id=p_product_id;
  update product_options set stock_quantity=0,is_in_stock=false where product_id=p_product_id;
end;
$$;

notify pgrst,'reload schema';
commit;
