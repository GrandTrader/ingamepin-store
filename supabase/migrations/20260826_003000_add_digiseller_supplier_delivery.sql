create table if not exists public.digiseller_deliveries (
  invoice_id bigint primary key,
  digiseller_product_id bigint not null,
  gift_card_code_id uuid not null unique references public.gift_card_codes(id),
  goods text not null,
  delivered_at timestamptz not null default now()
);

alter table public.product_options
  add column if not exists digiseller_option_id bigint,
  add column if not exists digiseller_variant_id bigint;

alter table public.digiseller_deliveries enable row level security;
revoke all on public.digiseller_deliveries from anon, authenticated;

create or replace function public.fulfill_digiseller_order(p_invoice_id bigint, p_digiseller_product_id bigint, p_product_option_id uuid)
returns table(goods text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.digiseller_deliveries%rowtype;
  v_option public.product_options%rowtype;
  v_code public.gift_card_codes%rowtype;
  v_product_stock integer;
  v_option_stock integer;
begin
  perform pg_advisory_xact_lock(p_invoice_id);

  select * into v_existing
  from public.digiseller_deliveries
  where invoice_id = p_invoice_id;

  if found then
    if v_existing.digiseller_product_id <> p_digiseller_product_id then
      raise exception 'Invoice product does not match the original delivery';
    end if;
    return query select v_existing.goods;
    return;
  end if;

  select * into v_option
  from public.product_options
  where id = p_product_option_id
    and digiseller_product_id = p_digiseller_product_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'DigiSeller product is not connected';
  end if;

  select * into v_code
  from public.gift_card_codes
  where product_option_id = v_option.id
    and status = 'AVAILABLE'
  order by created_at, id
  for update skip locked
  limit 1;

  if not found then
    raise exception 'Product is out of stock';
  end if;

  update public.gift_card_codes
  set status = 'SOLD', sold_at = now(), updated_at = now()
  where id = v_code.id;

  insert into public.digiseller_deliveries (
    invoice_id,
    digiseller_product_id,
    gift_card_code_id,
    goods
  ) values (
    p_invoice_id,
    p_digiseller_product_id,
    v_code.id,
    v_code.code
  );

  select count(*)::integer into v_option_stock
  from public.gift_card_codes
  where product_option_id = v_option.id
    and status = 'AVAILABLE';

  update public.product_options
  set stock_quantity = v_option_stock, updated_at = now()
  where id = v_option.id;

  select count(*)::integer into v_product_stock
  from public.gift_card_codes
  where product_id = v_option.product_id
    and status = 'AVAILABLE';

  update public.products
  set stock_quantity = v_product_stock, updated_at = now()
  where id = v_option.product_id;

  return query select v_code.code;
end;
$$;

revoke all on function public.fulfill_digiseller_order(bigint, bigint, uuid) from public, anon, authenticated;
