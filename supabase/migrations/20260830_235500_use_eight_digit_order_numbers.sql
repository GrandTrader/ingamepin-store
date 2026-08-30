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
  -- Serialize number generation so the uniqueness check remains safe when
  -- multiple customers create orders at exactly the same time.
  perform pg_advisory_xact_lock(hashtext('next_store_order_number'));

  loop
    v_order_number :=
      'IGP' ||
      to_char(v_order_date, 'DDMMYYYY') ||
      (floor(random() * 90000000) + 10000000)::bigint::text;

    exit when not exists (
      select 1 from public.orders where order_number = v_order_number
    );
  end loop;

  return v_order_number;
end;
$$;

revoke all on function public.next_store_order_number() from public, anon, authenticated;

comment on function public.next_store_order_number() is
  'Creates IGPDDMMYYYY followed by an 8-digit unique random number without separators.';
