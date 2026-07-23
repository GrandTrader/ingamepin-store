create or replace function public.create_store_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_option public.product_options%rowtype;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_method public.payment_method;
  v_fulfillment_mode text;
  v_player_id text;
  v_custom_value numeric(12,2);
begin
  p_customer_name := btrim(coalesce(p_customer_name, ''));
  p_customer_email := lower(btrim(coalesce(p_customer_email, '')));
  p_customer_phone := btrim(coalesce(p_customer_phone, ''));

  if length(p_customer_name) < 2 or length(p_customer_name) > 120 then
    raise exception 'Enter a valid customer name.';
  end if;
  if p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     or length(p_customer_email) > 254 then
    raise exception 'Enter a valid email address.';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'The cart is invalid.';
  end if;

  case lower(btrim(coalesce(p_payment_method, '')))
    when 'upi' then v_method := 'UPI';
    when 'binance_pay' then v_method := 'BINANCE_PAY';
    when 'binance' then v_method := 'BINANCE_PAY';
    when 'wallet' then v_method := 'WALLET';
    else raise exception 'The payment method is invalid.';
  end case;

  v_order_number :=
    'IGP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    id, order_number, customer_name, customer_email, customer_phone,
    customer_note, currency, subtotal, discount, total, status
  )
  values (
    v_order_id, v_order_number, p_customer_name, p_customer_email,
    nullif(p_customer_phone, ''), nullif(btrim(coalesce(p_customer_note, '')), ''),
    'USD', 0, 0, 0, 'PENDING_PAYMENT'
  );

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'productOptionId', '') = '' then
      raise exception 'Select a valid product option.';
    end if;

    select po.*
    into v_option
    from public.product_options po
    join public.products p on p.id = po.product_id
    where po.id = (v_item ->> 'productOptionId')::uuid
      and po.is_active = true
      and p.status = 'ACTIVE'
    for update of po;

    if not found then
      raise exception 'A selected product option is unavailable.';
    end if;

    select *
    into v_product
    from public.products
    where id = v_option.product_id;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_quantity < v_product.minimum_quantity
       or v_quantity > least(v_product.maximum_quantity, 5) then
      raise exception 'The selected quantity is not allowed for %.', v_product.name;
    end if;

    if v_option.stock_quantity < v_quantity then
      raise exception '% is out of stock.', v_option.option_name;
    end if;

    v_custom_value := nullif(v_item ->> 'customValue', '')::numeric;
    if v_custom_value is not null then
      if not v_product.allows_custom_value
         or v_custom_value < coalesce(v_product.minimum_custom_value, 0)
         or v_custom_value > coalesce(v_product.maximum_custom_value, v_custom_value) then
        raise exception 'The custom value is not allowed.';
      end if;
      v_unit_price := v_custom_value;
    else
      v_unit_price := v_option.selling_price;
    end if;

    v_fulfillment_mode := nullif(btrim(coalesce(v_item ->> 'fulfillmentMode', '')), '');
    v_player_id := nullif(btrim(coalesce(v_item ->> 'playerId', '')), '');
    if v_fulfillment_mode = 'PLAYER_ID_TOPUP'
       and (not v_product.allows_player_id_topup or v_player_id is null) then
      raise exception 'Valid player details are required.';
    end if;

    insert into public.order_items (
      order_id, product_id, product_option_id, product_name, option_name,
      denomination, platform, custom_value, fulfillment_mode, player_id,
      order_type, quantity, unit_price, total_price
    )
    values (
      v_order_id, v_product.id, v_option.id, v_product.name,
      v_option.option_name, v_option.denomination, v_option.platform,
      v_custom_value, v_fulfillment_mode, v_player_id, 'RETAIL',
      v_quantity, v_unit_price, v_unit_price * v_quantity
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  update public.orders
  set subtotal = v_subtotal, total = v_subtotal
  where id = v_order_id;

  insert into public.payments (
    order_id, method, status, amount, currency
  )
  values (
    v_order_id, v_method, 'PENDING', v_subtotal, 'USD'
  );

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'customer_name', p_customer_name,
    'customer_email', p_customer_email,
    'customer_phone', nullif(p_customer_phone, ''),
    'currency', 'USD',
    'subtotal', v_subtotal,
    'discount', 0,
    'total', v_subtotal,
    'status', 'PENDING_PAYMENT'
  );
end;
$$;

revoke all on function public.create_store_order(
  text, text, text, text, jsonb, text
) from public;

grant execute on function public.create_store_order(
  text, text, text, text, jsonb, text
) to anon, authenticated, service_role;
