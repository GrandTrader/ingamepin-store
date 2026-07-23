alter table public.products
alter column delivery_type
set default 'MANUAL';

create or replace function public.complete_manual_order(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_deliveries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_delivery jsonb;
  v_codes text[];
  v_code text;
  v_seen_codes text[] := array[]::text[];
  v_existing_code public.gift_card_codes%rowtype;
  v_delivery_count integer;
  v_distinct_item_count integer;
begin
  if not exists (
    select 1
    from public.admin_users
    where user_id = p_admin_user_id
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if jsonb_typeof(p_deliveries) <> 'array' then
    raise exception 'Delivery information is invalid.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order was not found.';
  end if;

  if v_order.status not in ('PAID', 'PROCESSING') then
    raise exception 'Only a paid processing order can be completed.';
  end if;

  select count(*)
  into v_delivery_count
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and p.delivery_type = 'MANUAL';

  select count(distinct entry ->> 'orderItemId')
  into v_distinct_item_count
  from jsonb_array_elements(p_deliveries) as deliveries(entry);

  if jsonb_array_length(p_deliveries) <> v_delivery_count
     or v_distinct_item_count <> v_delivery_count then
    raise exception 'Complete delivery information is required for every order item.';
  end if;

  for v_item in
    select oi.*
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and p.delivery_type = 'MANUAL'
    order by oi.created_at
  loop
    select entry
    into v_delivery
    from jsonb_array_elements(p_deliveries) as deliveries(entry)
    where entry ->> 'orderItemId' = v_item.id::text
    limit 1;

    if v_delivery is null then
      raise exception 'Delivery information is missing for %.', v_item.product_name;
    end if;

    if v_item.fulfillment_mode = 'PLAYER_ID_TOPUP' then
      if coalesce((v_delivery ->> 'completed')::boolean, false) is not true then
        raise exception 'Confirm the Player ID top-up for %.', v_item.product_name;
      end if;
    else
      select coalesce(
        array_agg(btrim(code_value)),
        array[]::text[]
      )
      into v_codes
      from jsonb_array_elements_text(
        coalesce(v_delivery -> 'codes', '[]'::jsonb)
      ) as codes(code_value)
      where btrim(code_value) <> '';

      if cardinality(v_codes) <> v_item.quantity then
        raise exception '% requires exactly % delivery code(s).',
          v_item.product_name,
          v_item.quantity;
      end if;

      foreach v_code in array v_codes
      loop
        if length(v_code) < 4 or length(v_code) > 500 then
          raise exception 'Every delivery code must contain between 4 and 500 characters.';
        end if;

        if v_code = any(v_seen_codes) then
          raise exception 'The same delivery code cannot be used more than once.';
        end if;

        v_seen_codes := array_append(v_seen_codes, v_code);

        select *
        into v_existing_code
        from public.gift_card_codes
        where code = v_code
        for update;

        if found then
          if v_existing_code.status <> 'AVAILABLE'
             or v_existing_code.product_id <> v_item.product_id
             or (
               v_item.product_option_id is not null
               and v_existing_code.product_option_id
                 is distinct from v_item.product_option_id
             ) then
            raise exception 'A delivery code is unavailable or belongs to another product option.';
          end if;

          update public.gift_card_codes
          set
            status = 'SOLD',
            order_item_id = v_item.id,
            reserved_at = now(),
            sold_at = now(),
            updated_at = now()
          where id = v_existing_code.id;
        else
          insert into public.gift_card_codes (
            product_id,
            product_option_id,
            order_item_id,
            denomination,
            code,
            status,
            reserved_at,
            sold_at,
            created_by
          )
          values (
            v_item.product_id,
            v_item.product_option_id,
            v_item.id,
            v_item.denomination,
            v_code,
            'SOLD',
            now(),
            now(),
            p_admin_user_id
          );
        end if;
      end loop;
    end if;
  end loop;

  update public.orders
  set
    status = 'DELIVERED',
    delivered_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'orderId', p_order_id,
    'orderStatus', 'DELIVERED',
    'deliveredAt', now()
  );
end;
$$;

revoke all on function public.complete_manual_order(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.complete_manual_order(uuid, uuid, jsonb)
to service_role;
