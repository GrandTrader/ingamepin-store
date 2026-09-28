begin;
-- Patch the installed checkout body so earlier channel and payment fixes remain intact.
do $migration$
declare
  original_source text;
  source text;
  old_assignment text := 'customer_ip=p_ip';
  new_assignment text := $assignment$customer_ip=nullif(btrim(p_ip),'')::inet$assignment$;
begin
  select pg_get_functiondef('public.portal_wallet_checkout(uuid,uuid,text,jsonb,text,numeric,text)'::regprocedure)
    into original_source;
  source := original_source;
  if position(new_assignment in source)=0 then
    if (length(source)-length(replace(source,old_assignment,'')))<>length(old_assignment) then
      raise exception 'The installed portal checkout differs from the expected version. No changes were applied.';
    end if;
    source := replace(source,old_assignment,new_assignment);
    execute source;
  end if;
end $migration$;
notify pgrst,'reload schema';
commit;
