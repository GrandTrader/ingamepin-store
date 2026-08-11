begin;

create or replace function public.apply_affiliate_order_pricing(
  p_order_id uuid,
  p_affiliate_click_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_click public.affiliate_clicks%rowtype;
  v_affiliate public.affiliate_accounts%rowtype;
  v_settings public.affiliate_settings%rowtype;
  v_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_selected_rate numeric(5,2);
  v_maximum_rate numeric(5,2);
  v_unit_markup numeric(12,2);
  v_item_markup numeric(12,2);
  v_total_markup numeric(12,2) := 0;
  v_new_subtotal numeric(12,2);
  v_new_total numeric(12,2);
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order was not found.';
  end if;

  if v_order.status <> 'PENDING_PAYMENT' or v_order.paid_at is not null then
    raise exception 'Affiliate pricing can only be applied before payment.';
  end if;

  if v_order.affiliate_id is not null then
    if v_order.affiliate_click_id = p_affiliate_click_id then
      return jsonb_build_object(
        'orderId', v_order.id,
        'affiliateId', v_order.affiliate_id,
        'clickId', v_order.affiliate_click_id,
        'markup', v_order.affiliate_markup,
        'subtotal', v_order.subtotal,
        'total', v_order.total
      );
    end if;

    raise exception 'This order already has affiliate pricing.';
  end if;

  select *
  into v_settings
  from public.affiliate_settings
  where id = 1;

  if not found or not v_settings.program_enabled then
    raise exception 'The affiliate program is not available.';
  end if;

  select *
  into v_click
  from public.affiliate_clicks
  where id = p_affiliate_click_id
  for update;

  if not found then
    raise exception 'Affiliate visit was not found.';
  end if;

  if v_click.created_at < now() - make_interval(days => v_settings.cookie_days) then
    raise exception 'The affiliate visit has expired.';
  end if;

  if v_click.converted_order_id is not null
     and v_click.converted_order_id <> v_order.id then
    raise exception 'This affiliate visit has already been used.';
  end if;

  select *
  into v_affiliate
  from public.affiliate_accounts
  where id = v_click.affiliate_id
    and status = 'APPROVED';

  if not found then
    raise exception 'Affiliate account is not approved.';
  end if;

  for v_item in
    select *
    from public.order_items
    where order_id = v_order.id
      and product_id = v_click.product_id
    order by created_at, id
    for update
  loop
    select *
    into v_product
    from public.products
    where id = v_item.product_id
      and status = 'ACTIVE'
      and affiliate_enabled = true;

    if not found then
      continue;
    end if;

    v_maximum_rate := coalesce(
      v_affiliate.commission_override_percent,
      v_product.affiliate_commission_percent
    );

    select commission_percent
    into v_selected_rate
    from public.affiliate_product_rates
    where affiliate_id = v_affiliate.id
      and product_id = v_product.id;

    v_selected_rate := least(
      coalesce(v_selected_rate, v_maximum_rate),
      v_maximum_rate
    );

    if v_selected_rate is null or v_selected_rate <= 0 then
      continue;
    end if;

    v_unit_markup := round(v_item.unit_price * v_selected_rate / 100, 2);
    v_item_markup := round(v_unit_markup * v_item.quantity, 2);

    update public.order_items
    set
      affiliate_base_unit_price = v_item.unit_price,
      affiliate_commission_percent = v_selected_rate,
      affiliate_markup_amount = v_item_markup,
      unit_price = v_item.unit_price + v_unit_markup,
      total_price = round(
        (v_item.unit_price + v_unit_markup) * v_item.quantity,
        2
      )
    where id = v_item.id;

    v_total_markup := v_total_markup + v_item_markup;
  end loop;

  if v_total_markup <= 0 then
    raise exception 'This order has no eligible affiliate product.';
  end if;

  v_new_subtotal := round(v_order.subtotal + v_total_markup, 2);
  v_new_total := round(v_order.total + v_total_markup, 2);

  update public.orders
  set
    affiliate_id = v_affiliate.id,
    affiliate_click_id = v_click.id,
    affiliate_markup = v_total_markup,
    subtotal = v_new_subtotal,
    total = v_new_total,
    updated_at = now()
  where id = v_order.id;

  update public.payments
  set
    amount = v_new_total,
    updated_at = now()
  where order_id = v_order.id;

  update public.affiliate_clicks
  set converted_order_id = v_order.id
  where id = v_click.id;

  return jsonb_build_object(
    'orderId', v_order.id,
    'affiliateId', v_affiliate.id,
    'clickId', v_click.id,
    'markup', v_total_markup,
    'subtotal', v_new_subtotal,
    'total', v_new_total
  );
end;
$$;

revoke all on function public.apply_affiliate_order_pricing(uuid, uuid)
  from public;

grant execute on function public.apply_affiliate_order_pricing(uuid, uuid)
  to service_role;

commit;
