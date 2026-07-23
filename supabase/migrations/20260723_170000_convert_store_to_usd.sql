-- Convert InGamePin selling prices and wallet values at the fixed business rate
-- of INR 85 = USD 1. Product face-value denominations remain unchanged.

update public.product_options po
set selling_price = round(po.selling_price / 85.0, 2),
    updated_at = now()
from public.products p
where p.id = po.product_id
  and p.currency = 'INR';

update public.products
set price = round(price / 85.0, 2),
    minimum_custom_value = case
      when minimum_custom_value is null then null
      else round(minimum_custom_value / 85.0, 2)
    end,
    maximum_custom_value = case
      when maximum_custom_value is null then null
      else round(maximum_custom_value / 85.0, 2)
    end,
    bulk_minimum_amount = case
      when bulk_minimum_amount is null then null
      else round(bulk_minimum_amount / 85.0, 2)
    end,
    currency = 'USD',
    updated_at = now()
where currency = 'INR';

update public.order_items oi
set custom_value = case
      when custom_value is null then null
      else round(custom_value / 85.0, 2)
    end,
    unit_price = round(unit_price / 85.0, 2),
    total_price = round(total_price / 85.0, 2)
from public.orders o
where o.id = oi.order_id
  and o.currency = 'INR';

update public.payments
set amount = round(amount / 85.0, 2),
    currency = 'USD',
    updated_at = now()
where currency = 'INR';

update public.orders
set subtotal = round(subtotal / 85.0, 2),
    discount = round(discount / 85.0, 2),
    total = round(total / 85.0, 2),
    currency = 'USD',
    updated_at = now()
where currency = 'INR';

update public.wallet_transactions wt
set amount = round(wt.amount / 85.0, 2),
    balance_before = round(wt.balance_before / 85.0, 2),
    balance_after = round(wt.balance_after / 85.0, 2)
where exists (
  select 1
  from public.customer_wallets cw
  where cw.user_id = wt.user_id
    and cw.currency = 'INR'
);

update public.wallet_topup_requests
set amount = round(amount / 85.0, 2),
    currency = 'USD',
    updated_at = now()
where currency = 'INR';

update public.customer_wallets
set balance = round(balance / 85.0, 2),
    currency = 'USD',
    updated_at = now()
where currency = 'INR';

alter table public.products alter column currency set default 'USD';
alter table public.orders alter column currency set default 'USD';
alter table public.payments alter column currency set default 'USD';
alter table public.customer_wallets alter column currency set default 'USD';
alter table public.wallet_topup_requests alter column currency set default 'USD';

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure
  );
  execute replace(v_definition, '''INR''', '''USD''');

  v_definition := pg_get_functiondef(
    'public.create_wallet_topup_request(numeric,text,text)'::regprocedure
  );
  v_definition := replace(v_definition, '''INR''', '''USD''');
  v_definition := replace(
    v_definition,
    'p_amount < 10 or p_amount > 100000',
    'p_amount < 1 or p_amount > 10000'
  );
  v_definition := replace(
    v_definition,
    'Enter an amount between INR 10 and INR 100,000.',
    'Enter an amount between USD 1 and USD 10,000.'
  );
  execute v_definition;

  v_definition := pg_get_functiondef(
    'public.approve_wallet_topup(uuid,uuid)'::regprocedure
  );
  execute replace(v_definition, '''INR''', '''USD''');

  v_definition := pg_get_functiondef(
    'public.complete_binance_wallet_topup(uuid,text,text)'::regprocedure
  );
  execute replace(v_definition, '''INR''', '''USD''');
end;
$$;
