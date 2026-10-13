begin;

alter table public.product_purchase_restrictions
  add column if not exists one_per_denomination boolean not null default false;
comment on column public.product_purchase_restrictions.one_per_denomination is
  'When enabled with the purchase restriction, each customer can buy one of each option (or custom face value) per reset period. Value-limit exemptions do not exempt this quantity rule.';

-- Called after all lines and authenticated customer details are written. Locks
-- serialize overlapping orders, including requests from different checkout APIs.
create or replace function public.assert_order_denomination_limits(p_order uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  buyer orders%rowtype;
  rule product_purchase_restrictions%rowtype;
  line record;
  since_at timestamptz;
  previous_value numeric;
  current_value numeric;
  actor uuid;
  matching_orders uuid[];
begin
  select * into buyer from orders where id=p_order;
  if not found or buyer.status::text not in ('PENDING_PAYMENT','PAID','PROCESSING','DELIVERED') then return; end if;
  if not exists(select 1 from order_items i join product_purchase_restrictions r on r.product_id=i.product_id
    where i.order_id=p_order and r.is_enabled and r.one_per_denomination) then return; end if;

  actor:=coalesce(buyer.customer_id,nullif(current_setting('app.business_buyer',true),'')::uuid);
  -- The business checkout wrapper sets this only from a server-authenticated user.
  if buyer.customer_id is null and actor is not null then
    update orders set customer_id=actor where id=p_order;
    buyer.customer_id:=actor;
  end if;
  -- Stable ordering prevents deadlocks for carts containing several products.
  for rule in select r.* from product_purchase_restrictions r
    where r.is_enabled and r.one_per_denomination
      and exists(select 1 from order_items i where i.order_id=p_order and i.product_id=r.product_id)
    order by r.product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('denomination-limit:'||rule.product_id::text,0));
    if rule.identity_mode<>'ACCOUNT_EMAIL' and buyer.customer_ip is null then
      raise exception 'Unable to verify the purchase limit. Please retry.';
    end if;
    since_at:=case rule.reset_mode
      when 'ROLLING_1_DAY' then now()-interval '1 day'
      when 'ROLLING_7_DAYS' then now()-interval '7 days'
      when 'ROLLING_30_DAYS' then now()-interval '30 days'
      when 'CALENDAR_WEEK' then date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'
      else null end;
    if since_at is null then raise exception 'Invalid purchase limit reset period.'; end if;

    -- Pending payments reserve quota. Paid purchases use their payment date, so
    -- a late payment cannot bypass the window by retaining an old creation date.
    select coalesce(array_agg(o.id),array[]::uuid[]) into matching_orders from orders o
    where o.id<>p_order and o.status::text in ('PENDING_PAYMENT','PAID','PROCESSING','DELIVERED')
      and coalesce(o.paid_at,o.created_at)>=since_at
      and ((rule.identity_mode<>'IP' and
        ((actor is not null and o.customer_id=actor) or lower(btrim(o.customer_email))=lower(btrim(buyer.customer_email))))
        or (rule.identity_mode<>'ACCOUNT_EMAIL' and o.customer_ip=buyer.customer_ip));

    for line in select i.product_option_id,i.custom_value,sum(i.quantity) as quantity
      from order_items i where i.order_id=p_order and i.product_id=rule.product_id
      group by i.product_option_id,i.custom_value
    loop
      if line.product_option_id is null then raise exception 'Unable to verify the product denomination.'; end if;
      if line.quantity>1 or exists(select 1 from order_items i
        where i.order_id=any(matching_orders) and i.product_id=rule.product_id
          and i.product_option_id=line.product_option_id and i.custom_value is not distinct from line.custom_value)
      then
        raise exception 'Only one of each denomination is allowed until your purchase limit resets. Check your existing orders or choose a different denomination.';
      end if;
    end loop;

    -- Exemptions remove only the face-value cap, never the denomination rule.
    if exists(select 1 from product_purchase_restriction_exemptions e
      where e.product_id=rule.product_id and e.user_id=actor) then continue; end if;
    select coalesce(sum(coalesce(i.custom_value,i.denomination)*i.quantity),0) into current_value
      from order_items i join product_options opt on opt.id=i.product_option_id
      where i.order_id=p_order and i.product_id=rule.product_id and opt.denomination_currency=rule.limit_currency;
    select coalesce(sum(coalesce(i.custom_value,i.denomination)*i.quantity),0) into previous_value
      from order_items i join product_options opt on opt.id=i.product_option_id
      where i.order_id=any(matching_orders) and i.product_id=rule.product_id and opt.denomination_currency=rule.limit_currency;
    if current_value+previous_value>rule.weekly_limit then
      raise exception '%',rule.notification_message;
    end if;
  end loop;
end $$;

create or replace function public.guard_order_denomination_limits()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_TABLE_NAME='orders' then
    perform assert_order_denomination_limits(NEW.id);
  else
    perform assert_order_denomination_limits(NEW.order_id);
  end if;
  return null;
end $$;

drop trigger if exists order_item_denomination_limit on public.order_items;
create constraint trigger order_item_denomination_limit
  after insert or update of order_id,product_id,product_option_id,custom_value,denomination,quantity on public.order_items
  deferrable initially deferred for each row execute function public.guard_order_denomination_limits();

-- Also guard reactivation/late payment and identity changes. Normal progress of
-- already-paid orders must continue even if an admin enabled the rule later.
drop trigger if exists order_denomination_limit on public.orders;
create constraint trigger order_denomination_limit
  after update on public.orders deferrable initially deferred for each row
  when (OLD.customer_id is distinct from NEW.customer_id or OLD.customer_email is distinct from NEW.customer_email
    or OLD.customer_ip is distinct from NEW.customer_ip
    or (OLD.status::text not in ('PAID','PROCESSING','DELIVERED') and OLD.status is distinct from NEW.status))
  execute function public.guard_order_denomination_limits();

-- Retail used to attach the IP in a later request. The restricted checkout must
-- persist it and the authenticated account in the same transaction as the items.
create or replace function public.create_purchase_checked_order(
  p_customer_name text,p_customer_email text,p_customer_phone text,p_payment_method text,p_items jsonb,
  p_customer_note text default null,p_user uuid default null,p_bulk_client uuid default null,p_ip text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; oid uuid;
begin
  result:=create_business_checked_order(p_customer_name,p_customer_email,p_customer_phone,p_payment_method,p_items,p_customer_note,p_user,p_bulk_client);
  oid:=(result->>'id')::uuid;
  update orders set customer_id=coalesce(nullif(current_setting('app.business_buyer',true),'')::uuid,customer_id),
    customer_ip=nullif(btrim(p_ip),'')::inet where id=oid;
  perform assert_order_denomination_limits(oid);
  return result;
end $$;

-- Check portal quotes and confirmations before payment as well as at commit.
-- Quotes roll back their temporary order, so deferred triggers alone would not
-- run for them. Preserve all previously installed pricing/delivery patches.
do $$
declare
  signature regprocedure:=to_regprocedure('public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)');
  definition text;
  anchor text:='update orders set customer_id=p_user,customer_ip=nullif(btrim(p_ip),'''')::inet where id=oid;';
begin
  if signature is null then return; end if;
  select pg_get_functiondef(signature) into definition;
  if position('-- denomination-purchase-limit-v1' in definition)>0 then return; end if;
  if position(anchor in definition)=0 then raise exception 'Install the portal checkout IP update before denomination purchase limits.'; end if;
  definition:=replace(definition,anchor,anchor||E'\n  -- denomination-purchase-limit-v1\n  perform assert_order_denomination_limits(oid);');
  execute definition;
end $$;

revoke all on function public.assert_order_denomination_limits(uuid),public.guard_order_denomination_limits(),
  public.create_purchase_checked_order(text,text,text,text,jsonb,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_purchase_checked_order(text,text,text,text,jsonb,text,uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
