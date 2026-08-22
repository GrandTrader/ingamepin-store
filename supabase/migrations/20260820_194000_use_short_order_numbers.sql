create table if not exists public.order_number_daily_counters (
  order_date date primary key,
  last_value bigint not null check (last_value >= 100),
  updated_at timestamptz not null default now()
);

alter table public.order_number_daily_counters enable row level security;

revoke all on table public.order_number_daily_counters from public, anon, authenticated;

comment on table public.order_number_daily_counters is
  'Internal daily counter used to create short, concurrency-safe store order numbers.';

create or replace function public.next_store_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_date date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
  v_order_number text;
begin
  loop
    v_order_number :=
      'IGP' ||
      to_char(v_order_date, 'DDMMYYYY') ||
      lpad((floor(random() * 900000) + 100000)::bigint::text, 6, '0');

    exit when not exists (
      select 1 from public.orders where order_number = v_order_number
    );
  end loop;

  return v_order_number;
end;
$$;

revoke all on function public.next_store_order_number() from public, anon, authenticated;

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
  v_submitted_information jsonb;
  v_customer_information jsonb;
  v_field record;
  v_field_value text;
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
    when 'nowpayments' then v_method := 'NOWPAYMENTS';
    when 'pally' then v_method := 'PALLY';
    when 'freekassa' then v_method := 'FREEKASSA';
    when 'usdt' then v_method := 'USDT_DIRECT';
    when 'wallet' then v_method := 'WALLET';
    else raise exception 'The payment method is invalid.';
  end case;

  v_order_number := public.next_store_order_number();

  insert into public.orders (
    id, order_number, customer_name, customer_email, customer_phone,
    customer_note, currency, subtotal, discount, total, status
  )
  values (
    v_order_id, v_order_number, p_customer_name, p_customer_email,
    nullif(p_customer_phone, ''), nullif(btrim(coalesce(p_customer_note, '')), ''),
    'USD', 0, 0, 0, 'PENDING_PAYMENT'
  );

  for v_item in select value from jsonb_array_elements(p_items)
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

    select * into v_product
    from public.products
    where id = v_option.product_id;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 1);

    if v_quantity < 1 then
      raise exception 'The selected quantity is not allowed for %.', v_product.name;
    end if;

    if not v_product.is_bulk_order then
      if v_quantity < coalesce(v_option.minimum_quantity, v_product.minimum_quantity)
         or v_quantity > coalesce(v_option.maximum_quantity, v_product.maximum_quantity) then
        raise exception 'Allowed quantity for %: %-%', v_product.name, coalesce(v_option.minimum_quantity, v_product.minimum_quantity), coalesce(v_option.maximum_quantity, v_product.maximum_quantity);
      end if;

      if v_option.stock_quantity < v_quantity then
        raise exception '% is out of stock.', v_option.option_name;
      end if;
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

    v_fulfillment_mode :=
      nullif(btrim(coalesce(v_item ->> 'fulfillmentMode', '')), '');
    v_player_id :=
      nullif(btrim(coalesce(v_item ->> 'playerId', '')), '');

    if v_fulfillment_mode = 'PLAYER_ID_TOPUP'
       and (not v_product.allows_player_id_topup or v_player_id is null) then
      raise exception 'Valid player details are required.';
    end if;

    v_submitted_information := coalesce(v_item -> 'customerInformation', '[]'::jsonb);
    if jsonb_typeof(v_submitted_information) <> 'array'
       or jsonb_array_length(v_submitted_information) > 20 then
      raise exception 'Customer information is invalid for %.', v_product.name;
    end if;

    v_customer_information := '[]'::jsonb;

    for v_field in
      select id, label, field_type, is_required
      from public.product_customer_fields
      where product_id = v_product.id
      order by sort_order, created_at
    loop
      select btrim(coalesce(entry ->> 'value', ''))
      into v_field_value
      from jsonb_array_elements(v_submitted_information) entry
      where entry ->> 'fieldId' = v_field.id::text
      limit 1;

      v_field_value := coalesce(v_field_value, '');

      if v_field.is_required and v_field_value = '' then
        raise exception '% is required for %.', v_field.label, v_product.name;
      end if;

      if length(v_field_value) > 500 then
        raise exception '% is too long.', v_field.label;
      end if;

      if v_field_value <> ''
         and v_field.field_type = 'EMAIL'
         and v_field_value !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
        raise exception 'Enter a valid %.', v_field.label;
      end if;

      if v_field_value <> ''
         and v_field.field_type = 'NUMBER'
         and v_field_value !~ '^-?[0-9]+([.][0-9]+)?$' then
        raise exception 'Enter a valid %.', v_field.label;
      end if;

      if v_field_value <> '' then
        v_customer_information :=
          v_customer_information ||
          jsonb_build_array(
            jsonb_build_object(
              'fieldId', v_field.id,
              'label', v_field.label,
              'type', v_field.field_type,
              'value', v_field_value
            )
          );
      end if;
    end loop;

    insert into public.order_items (
      order_id, product_id, product_option_id, product_name, option_name,
      denomination, platform, custom_value, fulfillment_mode, player_id,
      customer_information, order_type, quantity, unit_price, total_price
    )
    values (
      v_order_id, v_product.id, v_option.id, v_product.name,
      v_option.option_name, v_option.denomination, v_option.platform,
      v_custom_value, v_fulfillment_mode, v_player_id,
      v_customer_information, 'RETAIL',
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
