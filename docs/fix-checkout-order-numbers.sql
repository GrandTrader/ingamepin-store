-- Run this entire file in Supabase SQL Editor. Existing orders are not renamed.
begin;

-- Only future orders change. Existing references remain valid for search,
-- payment reconciliation, receipts and refunds.
create or replace function public.next_store_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_order_number text;
begin
  -- Held until the caller inserts its order and commits, as in the old generator.
  perform pg_advisory_xact_lock(hashtext('next_store_order_number'));
  v_prefix := 'IP' || to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYYMMDD');

  for attempt in 1..1000 loop
    v_order_number := v_prefix || (floor(random() * 900000) + 100000)::bigint::text;
    if not exists (select 1 from public.orders where order_number = v_order_number) then
      return v_order_number;
    end if;
  end loop;

  -- Fail safely instead of looping indefinitely if the daily space fills up.
  raise exception 'Unable to allocate an order number. Please try again.';
end;
$$;

revoke all on function public.next_store_order_number() from public, anon, authenticated;
comment on function public.next_store_order_number() is
  'New orders: IP + India placement date YYYYMMDD + 6 random digits. Existing order numbers are unchanged.';

-- Some installations still have the original inline IGP number assignment.
-- Patch only that assignment, preserving all live checkout customizations.
do $$
declare
  v_function regprocedure := 'public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure;
  v_definition text;
  v_pattern text := '\mv_order_number\s*:=\s*[^;]+;';
  v_assignment text;
  v_count integer;
begin
  if to_regprocedure('public.next_store_order_number()') is null then
    raise exception 'Install the IP order number generator before this migration.';
  end if;

  v_definition := pg_get_functiondef(v_function);
  select count(*), min(m[1]) into v_count, v_assignment
  from regexp_matches(v_definition, '(' || v_pattern || ')', 'gi') as m;

  if v_count <> 1 then
    raise exception 'Unexpected checkout function: expected one order number assignment. No changes applied.';
  end if;
  if v_assignment !~* 'next_store_order_number\s*\(' and v_assignment !~* '''IGP' then
    raise exception 'Unrecognized checkout number generator. No changes applied.';
  end if;

  execute regexp_replace(v_definition, v_pattern,
    'v_order_number := public.next_store_order_number();', 'i');
end;
$$;

commit;

select position('v_order_number := public.next_store_order_number();' in
  pg_get_functiondef('public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure)) > 0
  as checkout_uses_ip_generator;
