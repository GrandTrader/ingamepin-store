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
