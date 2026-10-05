begin;

-- The server supplies the signed-in user; clients cannot execute this RPC directly.
create or replace function public.complete_business_profile(p_user uuid, p_details jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r business_kyb; item record; limits jsonb := '{"contact_name":120,"phone":40,"representative_role":100,"residence_country":100,"legal_name":160,"entity_type":100,"registration_number":100,"tax_number":100,"incorporation_date":10,"registration_jurisdiction":120,"country":100,"website":300,"address_line1":150,"address_line2":150,"city":80,"state":80,"postal_code":16,"owners":2000,"activity":2000,"monthly_volume":100,"interest":4}';
  address_keys text[] := array['address_line1','address_line2','city','state','postal_code'];
  merged jsonb; changed_keys text[] := '{}'; structured_address boolean; security jsonb;
begin
  perform 1 from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'Sign in with a verified account.'; end if;
  select * into r from business_kyb where user_id=p_user for update;
  if not found or r.status<>'APPROVED' then raise exception 'Approved business access is required.'; end if;
  security := public.business_security_status(p_user);
  if coalesce((security->>'password_ready')::boolean,false) is not true or coalesce((security->>'totp_ready')::boolean,false) is not true then raise exception 'Complete your business password and authenticator setup first.'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or p_details='{}'::jsonb or pg_column_size(p_details)>12000 then raise exception 'Fill at least one empty business field.'; end if;
  structured_address := exists(select 1 from unnest(address_keys) k where btrim(coalesce(r.details->>k,''))<>'');
  for item in select key,value from jsonb_each(p_details) loop
    if not (limits ? item.key) or jsonb_typeof(item.value)<>'string' then raise exception 'Unsupported business profile field.'; end if;
    if length(btrim(item.value #>> '{}')) not between 1 and (limits->>item.key)::integer then raise exception 'Enter a valid value for %.',item.key; end if;
    if btrim(coalesce(r.details->>item.key,''))<>'' then raise exception 'Saved business details are locked. Refresh the page or contact support.'; end if;
    if item.key=any(address_keys) and btrim(coalesce(r.details->>'address',''))<>'' and not structured_address then raise exception 'Your existing registered address is locked. Contact support.'; end if;
    changed_keys := array_append(changed_keys,item.key);
  end loop;
  merged := r.details || p_details;
  if p_details ?| address_keys then
    merged := merged || jsonb_build_object('address',concat_ws(E'\n',nullif(btrim(merged->>'address_line1'),''),nullif(btrim(merged->>'address_line2'),''),nullif(btrim(merged->>'city'),''),nullif(btrim(merged->>'state'),''),nullif(btrim(merged->>'postal_code'),''),nullif(btrim(merged->>'country'),'')));
  end if;
  merged := merged || jsonb_build_object('customer_completed_fields',concat_ws(', ',nullif(r.details->>'customer_completed_fields',''),array_to_string(changed_keys,', ')),'customer_completed_at',now()::text);
  if pg_column_size(merged)>16000 then raise exception 'Business profile is too large. Contact support.'; end if;
  update business_kyb set details=merged,revision=revision+1 where user_id=p_user;
  insert into business_kyb_events(user_id,actor_id,status,revision,note)
    values(p_user,p_user,r.status,r.revision+1,'Customer completed and locked previously blank fields: '||array_to_string(changed_keys,', '));
end $$;
revoke all on function public.complete_business_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_business_profile(uuid,jsonb) to service_role;
commit;
