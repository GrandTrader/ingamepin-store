begin;
-- Save the whole batch atomically; share order locks with refunds and service delivery.
create or replace function public.deliver_manual_codes_batch(
  p_order_id uuid, p_item_id uuid, p_admin_user_id uuid, p_codes text[]
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item public.order_items%rowtype;
  v_status text;
  v_bulk boolean;
  v_codes text[];
  v_new text[];
  v_existing text[];
  v_remaining integer;
begin
  if not exists (select 1 from public.admin_users where user_id=p_admin_user_id) then
    raise exception 'Administrator access is required.';
  end if;
  select status::text into v_status from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  select oi.* into v_item from public.order_items oi join public.products p on p.id=oi.product_id
    where oi.id=p_item_id and oi.order_id=p_order_id and p.delivery_type='MANUAL' for update of oi;
  if not found then raise exception 'This denomination cannot be sent as codes.'; end if;
  if v_item.fulfillment_mode='PLAYER_ID_TOPUP' or v_item.service_delivered_at is not null then
    raise exception 'This denomination cannot be sent as codes.';
  end if;
  select coalesce(array_agg(btrim(c) order by n),array[]::text[]) into v_codes
    from unnest(p_codes) with ordinality as x(c,n) where c is not null and btrim(c)<>'';
  if cardinality(v_codes)=0 then raise exception 'Enter at least one delivery code.'; end if;
  if (select count(distinct c) from unnest(v_codes) c)<>cardinality(v_codes) then
    raise exception 'Duplicate delivery codes are not allowed.';
  end if;
  select coalesce(array_agg(locked.code),array[]::text[]) into v_existing
    from (select code from public.gift_card_codes where code=any(v_codes) order by id for update) locked;
  if exists (select 1 from public.gift_card_codes c where c.code=any(v_existing)
    and not (c.status='SOLD' and c.order_item_id is not distinct from p_item_id)
    and (c.status<>'AVAILABLE' or c.product_id is distinct from v_item.product_id
      or c.product_option_id is distinct from v_item.product_option_id)) then
    raise exception 'A code is unavailable or belongs to another denomination.';
  end if;
  select coalesce(array_agg(c order by n),array[]::text[]) into v_new
    from unnest(v_codes) with ordinality as x(c,n)
    where not exists (select 1 from public.gift_card_codes g where g.code=c and g.code=any(v_existing)
      and g.status='SOLD' and g.order_item_id=p_item_id);
  if cardinality(v_new)=0 then
    return jsonb_build_object('codes',v_new,'skipped',cardinality(v_codes));
  end if;
  if v_status not in ('PAID','PROCESSING') then
    raise exception 'Only a paid processing order can receive codes.';
  end if;
  select v_item.quantity-(select count(*) from public.gift_card_codes where order_item_id=p_item_id and status='SOLD')
    -coalesce((select sum(quantity) from public.order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED'),0)
    into v_remaining;
  if cardinality(v_new)>v_remaining then
    raise exception 'Only % code(s) remain. You cannot deliver more than the ordered quantity.',greatest(v_remaining,0);
  end if;
  select coalesce(is_bulk_order,false) into v_bulk from public.products where id=v_item.product_id;
  if not v_bulk and cardinality(v_new)<>v_remaining then
    raise exception 'This product requires exactly % remaining code(s).',v_remaining;
  end if;
  -- Insert first: the unique code constraint makes concurrent reuse roll back the whole batch.
  insert into public.gift_card_codes(product_id,product_option_id,order_item_id,denomination,code,status,reserved_at,sold_at,created_by)
    select v_item.product_id,v_item.product_option_id,p_item_id,v_item.denomination,c,'SOLD',now(),now(),p_admin_user_id
    from unnest(v_new) c where not (c=any(v_existing));
  update public.gift_card_codes set status='SOLD',order_item_id=p_item_id,
    reserved_at=now(),sold_at=now(),updated_at=now() where code=any(v_new) and status='AVAILABLE';
  return jsonb_build_object('codes',v_new,'skipped',cardinality(v_codes)-cardinality(v_new));
end;
$$;
revoke all on function public.deliver_manual_codes_batch(uuid,uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.deliver_manual_codes_batch(uuid,uuid,uuid,text[]) to service_role;
notify pgrst, 'reload schema';
commit;
