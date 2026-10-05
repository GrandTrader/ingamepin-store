begin;

-- Reuse account status and audit history so existing orders, API keys and deposits retain their access checks.
create or replace function public.submit_business_interest(p_user uuid, p_details jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r business_kyb; customer_email text;
begin
  select email into customer_email from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found or customer_email is null then raise exception 'Verify your account email before applying.'; end if;
  select * into r from business_kyb where user_id=p_user for update;
  if found and r.status not in ('REJECTED','REVOKED') then raise exception 'You already have a request or business account. Contact support to make changes.'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or pg_column_size(p_details)>12000
    or length(btrim(coalesce(p_details->>'legal_name',''))) not between 2 and 160
    or length(btrim(coalesce(p_details->>'contact_name',''))) not between 2 and 120
    or length(btrim(coalesce(p_details->>'country',''))) not between 2 and 100
    or length(btrim(coalesce(p_details->>'activity',''))) not between 10 and 2000
    or coalesce(p_details->>'interest','') not in ('B2B','API','BOTH')
    or coalesce(p_details->>'consent','')<>'business-interest-v1' then raise exception 'Complete the business interest form.'; end if;
  insert into business_kyb(user_id,status,details,documents,revision)
    values(p_user,'PENDING',coalesce(r.details,'{}'::jsonb)||p_details||jsonb_build_object('email',lower(customer_email),'onboarding_method','EMAIL'),coalesce(r.documents,'{}'::jsonb),coalesce(r.revision,0)+1)
  on conflict(user_id) do update set status='PENDING',details=excluded.details,revision=excluded.revision,
    review_note=null,reviewed_by=null,reviewed_at=null,submitted_at=now();
  insert into business_kyb_events(user_id,actor_id,status,revision,note)
    values(p_user,p_user,'PENDING',coalesce(r.revision,0)+1,'B2B/API interest submitted; awaiting email verification');
end $$;

create or replace function public.create_email_business_account(p_admin uuid,p_email text,p_details jsonb,p_note text,p_confirmed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare customer uuid; customer_email text;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  if p_confirmed is distinct from true then raise exception 'Confirm that business verification was completed by email.'; end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Enter a review note (3-1000 characters).'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or pg_column_size(p_details)>12000
    or length(btrim(coalesce(p_details->>'legal_name',''))) not between 2 and 160
    or length(btrim(coalesce(p_details->>'country',''))) not between 2 and 100 then raise exception 'Enter the business name and country.'; end if;
  select id,email into customer,customer_email from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null for update;
  if not found then raise exception 'No verified customer found with this email. Ask the customer to register and verify their email first.'; end if;
  if exists(select 1 from business_kyb where user_id=customer) then raise exception 'This customer already has a request or business account. Use its review controls below.'; end if;
  insert into business_kyb(user_id,status,details,documents,review_note,reviewed_by,reviewed_at)
    values(customer,'APPROVED',p_details||jsonb_build_object('email',lower(customer_email),'onboarding_method','EMAIL','verification_method','EMAIL'),'{}',btrim(p_note),p_admin,now());
  insert into business_kyb_events(user_id,actor_id,status,revision,note)
    values(customer,p_admin,'APPROVED',1,'Business verified by email. '||btrim(p_note));
end $$;

create or replace function public.review_email_business_account(p_user uuid,p_admin uuid,p_revision integer,p_status text,p_note text,p_confirmed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r business_kyb;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  -- Match the lock order used by customer interest submissions and direct activation.
  perform 1 from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'The customer must have a verified account email.'; end if;
  select * into r from business_kyb where user_id=p_user for update;
  if not found or p_revision is null or r.revision<>p_revision then raise exception 'Request changed. Refresh before reviewing.'; end if;
  if p_status is null or not ((r.status in ('PENDING','REJECTED','REVOKED') and p_status='APPROVED') or (r.status='PENDING' and p_status='REJECTED') or (r.status='APPROVED' and p_status='REVOKED')) then raise exception 'This review is no longer available.'; end if;
  if p_status='APPROVED' and p_confirmed is distinct from true then raise exception 'Confirm that business verification was completed by email.'; end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Enter a review note (3-1000 characters).'; end if;
  update business_kyb set status=p_status,review_note=btrim(p_note),reviewed_by=p_admin,reviewed_at=now(),revision=revision+1,
    details=case when p_status='APPROVED' then details||jsonb_build_object('verification_method','EMAIL') else details end where user_id=p_user;
  insert into business_kyb_events(user_id,actor_id,status,revision,note)
    values(p_user,p_admin,p_status,r.revision+1,case when p_status='APPROVED' then 'Business verified by email. ' else '' end||btrim(p_note));
end $$;

revoke all on function public.submit_business_interest(uuid,jsonb),public.create_email_business_account(uuid,text,jsonb,text,boolean),public.review_email_business_account(uuid,uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.submit_business_interest(uuid,jsonb),public.create_email_business_account(uuid,text,jsonb,text,boolean),public.review_email_business_account(uuid,uuid,integer,text,text,boolean) to service_role;

commit;
