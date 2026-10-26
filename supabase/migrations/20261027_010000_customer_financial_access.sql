begin;

-- Existing customer restrictions now cover all new financial actions. Wallet
-- history/sign-in/support remain readable. No additional customer is restricted.
create or replace function public.customer_financial_access(p_user uuid,p_browser uuid default null,p_ip text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
  if p_user is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,27401));
  if not exists(select 1 from auth.users where id=p_user) then return false; end if;
  allowed:=public.customer_purchase_access(p_user,null,p_browser,p_ip);
  if not allowed or exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'wallet_disabled'='true') then return false; end if;
  -- Direct RPCs cannot omit a browser already observed for this account. Only
  -- trusted server observations are consulted; caller-supplied IDs are not used.
  return not exists(
    select 1 from public.customer_purchase_restrictions r
    join public.customer_purchase_restriction_keys k on k.customer_id=r.customer_id
    join (
      select kind,value from public.customer_purchase_observations where customer_id=p_user and seen_at>=now()-interval '180 days'
      union select 'BROWSER',browser_id::text from public.customer_login_events where user_id=p_user and created_at>=now()-interval '180 days' and browser_id is not null
      union select 'IP',host(ip_address) from public.customer_login_events where user_id=p_user and created_at>=now()-interval '180 days' and ip_address is not null
    ) seen on seen.kind=k.kind and seen.value=k.value
    where r.enabled and ((k.kind='BROWSER' and r.block_devices) or (k.kind='IP' and r.block_ips))
  );
end $$;
revoke all on function public.customer_financial_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.customer_financial_access(uuid,uuid,text) to service_role;

create or replace function public.assert_customer_financial_access(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.customer_financial_access(p_user) then
    raise exception 'Financial transactions are restricted. Contact support. You can still view your history.';
  end if;
end $$;
revoke all on function public.assert_customer_financial_access(uuid) from public,anon,authenticated;

create or replace function public.lock_customer_financial_restriction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text,27401));
  return new;
end $$;
drop trigger if exists customer_financial_restriction_lock on public.customer_purchase_restrictions;
create trigger customer_financial_restriction_lock before insert or update on public.customer_purchase_restrictions
for each row execute function public.lock_customer_financial_restriction();

-- Reject all balance/ledger changes, including refund claims and alternate RPCs.
create or replace function public.guard_customer_wallet_finance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='customer_wallets' then
    if tg_op='INSERT' then
      if new.balance=0 then return new; end if;
    elsif new.balance is not distinct from old.balance and new.currency is not distinct from old.currency then return new;
    end if;
  end if;
  perform public.assert_customer_financial_access(new.user_id);
  return new;
end $$;
drop trigger if exists customer_wallet_financial_guard on public.customer_wallets;
create trigger customer_wallet_financial_guard before insert or update on public.customer_wallets
for each row execute function public.guard_customer_wallet_finance();
drop trigger if exists customer_ledger_financial_guard on public.wallet_transactions;
create trigger customer_ledger_financial_guard before insert on public.wallet_transactions
for each row execute function public.guard_customer_wallet_finance();

alter table public.wallet_topup_requests add column if not exists financial_hold_at timestamptz;
alter table public.wallet_topup_requests add column if not exists financial_hold_released_at timestamptz;
create or replace function public.guard_customer_financial_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform public.assert_customer_financial_access(new.user_id);
  elsif tg_table_name='wallet_topup_requests' then
    if new.gateway_order_id is distinct from old.gateway_order_id or (new.status='APPROVED' and old.status<>'APPROVED') then
      perform public.assert_customer_financial_access(new.user_id);
    end if;
    if old.financial_hold_at is not null and old.financial_hold_released_at is null and new.status='REJECTED' then
      raise exception 'Payment was received and is held for review. Do not reject it as unpaid.';
    end if;
    if old.financial_hold_at is not null and new.status='APPROVED' and old.status<>'APPROVED' then
      new.financial_hold_released_at:=now();
    end if;
  elsif tg_table_name='wallet_withdrawal_requests' then
    if new.status in ('APPROVED','PAID') and new.status is distinct from old.status then
      perform public.assert_customer_financial_access(new.user_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists wallet_topup_financial_guard on public.wallet_topup_requests;
create trigger wallet_topup_financial_guard before insert or update on public.wallet_topup_requests
for each row execute function public.guard_customer_financial_request();
drop trigger if exists wallet_withdrawal_financial_guard on public.wallet_withdrawal_requests;
create trigger wallet_withdrawal_financial_guard before insert or update on public.wallet_withdrawal_requests
for each row execute function public.guard_customer_financial_request();
drop trigger if exists business_invoice_financial_guard on public.business_bank_invoices;
create trigger business_invoice_financial_guard before insert on public.business_bank_invoices
for each row execute function public.guard_customer_financial_request();
drop trigger if exists business_deposit_financial_guard on public.business_bank_deposits;
create trigger business_deposit_financial_guard before insert on public.business_bank_deposits
for each row execute function public.guard_customer_financial_request();

-- Record verified incoming money exactly once without crediting frozen balances.
create or replace function public.hold_restricted_wallet_payment(p_request uuid,p_gateway text,p_transaction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wallet_topup_requests%rowtype;
begin
  select * into strict r from public.wallet_topup_requests where id=p_request for update;
  if nullif(btrim(p_gateway),'') is null or nullif(btrim(p_transaction),'') is null or r.gateway_order_id is distinct from btrim(p_gateway) then
    raise exception 'Wallet payment verification failed.';
  end if;
  if r.status='APPROVED' then return null; end if;
  if nullif(btrim(r.gateway_transaction_id),'') is not null and r.gateway_transaction_id<>btrim(p_transaction) then
    raise exception 'A different payment transaction is already recorded.';
  end if;
  if r.financial_hold_at is not null and r.financial_hold_released_at is null then
    return jsonb_build_object('held',true,'requiresReview',true,'alreadyCompleted',true);
  end if;
  if public.customer_financial_access(r.user_id) then return null; end if;
  update public.wallet_topup_requests set status='PENDING',gateway_transaction_id=btrim(p_transaction),
    paid_at=coalesce(paid_at,now()),financial_hold_at=now(),
    rejection_reason='Payment received while financial access was restricted. Funds are held for administrator review; wallet was not credited.',updated_at=now()
    where id=r.id;
  return jsonb_build_object('held',true,'requiresReview',true,'alreadyCompleted',false);
end $$;
revoke all on function public.hold_restricted_wallet_payment(uuid,text,text) from public,anon,authenticated;

-- Preserve installed verification, expiry and duplicate-payment behavior.
do $$
declare signature text; definition text; anchor text; gateway text;
begin
  foreach signature in array array['public.complete_wallet_gateway_topup(uuid,text,text)','public.complete_binance_wallet_topup(uuid,text,text)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('customer-financial-hold-v1' in definition)=0 then
      gateway:=case when signature like '%complete_binance%' then 'p_prepay_id' else 'p_gateway_order_id' end;
      anchor:='  if v_request.status <> ''PENDING''';
      if position(anchor in definition)=0 then raise exception 'Unexpected wallet completion function: %',signature; end if;
      definition:=replace(definition,anchor,E'  -- customer-financial-hold-v1\n  declare held jsonb; begin\n    held:=public.hold_restricted_wallet_payment(p_request_id,'||gateway||E',p_transaction_id);\n    if held is not null then return held; end if;\n  end;\n'||anchor);
      execute definition;
    end if;
  end loop;
end $$;

-- Use payment review instead of delivering new goods after a restriction.
do $$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.hold_expired_checkout_payment(uuid,text)'::regprocedure);
  if position('customer-financial-order-hold-v1' in definition)=0 then
    anchor:='  if o.payment_expired_at is null and not';
    if position(anchor in definition)=0 then raise exception 'Unexpected checkout hold function'; end if;
    definition:=replace(definition,anchor,E'  -- customer-financial-order-hold-v1\n  if public.customer_purchase_access(o.customer_id,o.customer_email,null,host(o.customer_ip)) and o.payment_expired_at is null and not');
    definition:=replace(definition,'''Payment received after checkout expired. Review or refund before delivery.''',
      'case when not public.customer_purchase_access(o.customer_id,o.customer_email,null,host(o.customer_ip)) then ''Payment received for a restricted customer. Review or refund before delivery.'' else ''Payment received after checkout expired. Review or refund before delivery.'' end');
    execute definition;
  end if;
end $$;
create or replace function public.guard_restricted_order_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.paid_at is null and new.paid_at is not null and not public.customer_purchase_access(new.customer_id,new.customer_email,null,host(new.customer_ip)) then
    raise exception 'Customer financial transactions are restricted. Review the restriction before approving payment.';
  end if;
  return new;
end $$;
drop trigger if exists restricted_order_payment_guard on public.orders;
create trigger restricted_order_payment_guard before update on public.orders for each row execute function public.guard_restricted_order_payment();
revoke all on function public.lock_customer_financial_restriction(),public.guard_customer_wallet_finance(),
 public.guard_customer_financial_request(),public.guard_restricted_order_payment() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
