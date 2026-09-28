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
