begin;
-- Match the database safe-update rule. Only currently available catalogue rows are reset.
-- This changes the function definition; it does not enable products or submit supplier orders.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.sync_definiteplay_ranges(jsonb,timestamptz,boolean)'::regprocedure);
 if position('update definiteplay_ranges set available=false;' in definition)>0 then
  definition:=replace(definition,
   'update definiteplay_ranges set available=false;',
   'update definiteplay_ranges set available=false where available=true;');
  execute definition;
 elsif position('update definiteplay_ranges set available=false where available=true;' in definition)=0 then
  raise exception 'Unexpected supplier sync definition. No changes made.';
 end if;
end;
$$;
notify pgrst,'reload schema';
commit;
