begin;

create or replace function public.create_business_bank_invoice_with_billing(p_id uuid,p_user uuid,p_amount numeric,p_billing jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare existing business_bank_invoices; settings business_bank_settings; details jsonb; customer_email text; field text; max_length integer;
begin
  if p_id is null or p_user is null then raise exception 'Invalid invoice request.'; end if;
  select email into customer_email from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'Sign in with a verified email.'; end if;
  if exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'wallet_disabled'='true') then raise exception 'Wallet deposits are disabled. Contact support.'; end if;
  select k.details into details from business_kyb k where user_id=p_user and status='APPROVED' for share;
  if not found then raise exception 'Approved business verification is required.'; end if;
  if p_amount is null or p_amount <> round(p_amount,2) or p_amount not between 10 and 50000 then raise exception 'Enter USD 10–50,000 with at most two decimal places.'; end if;
  select * into existing from business_bank_invoices where id=p_id;
  if found then
    if existing.user_id<>p_user or existing.amount_usd<>p_amount then raise exception 'Invoice request changed. Refresh and try again.'; end if;
    return existing.id;
  end if;
  if p_billing is null or jsonb_typeof(p_billing)<>'object' then raise exception 'Enter complete billing details.'; end if;
  foreach field in array array['addressLine1','city','state','postalCode','country','taxpayerId'] loop
    max_length:=case field when 'addressLine1' then 200 when 'country' then 150 when 'postalCode' then 30 else 100 end;
    if jsonb_typeof(p_billing->field) is distinct from 'string' or length(btrim(p_billing->>field)) not between 1 and max_length then raise exception 'Full address, PIN / postal code and tax number are required.'; end if;
  end loop;
  if length(btrim(p_billing->>'addressLine1'))<3 or length(btrim(p_billing->>'country'))<2 or length(coalesce(p_billing->>'addressLine2',''))>200 then raise exception 'Enter a complete billing address.'; end if;
  if lower(btrim(p_billing->>'country'))='india' and btrim(p_billing->>'postalCode') !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid six-digit Indian PIN code.'; end if;
  if btrim(p_billing->>'postalCode') !~ '^[a-zA-Z0-9][a-zA-Z0-9 -]{0,29}$' then raise exception 'Enter a valid PIN / postal code.'; end if;
  select * into settings from business_bank_settings where id=true and enabled=true for share;
  if not found then raise exception 'Bank deposits are not available right now.'; end if;
  if (select count(*) from business_bank_invoices where user_id=p_user and created_at>now()-interval '24 hours')>=20 then raise exception 'You can generate up to 20 bank invoices per day. Use an existing invoice or contact support.'; end if;
  insert into business_bank_invoices(id,user_id,amount_usd,buyer,bank_instructions)
  values(p_id,p_user,p_amount,jsonb_build_object('name',details->>'legal_name','address',concat_ws(E'\n',btrim(p_billing->>'addressLine1'),nullif(btrim(p_billing->>'addressLine2'),''),btrim(p_billing->>'city'),btrim(p_billing->>'state'),btrim(p_billing->>'postalCode'),btrim(p_billing->>'country')),'country',btrim(p_billing->>'country'),'registration_number',btrim(p_billing->>'taxpayerId'),'email',customer_email),settings.instructions);
  return p_id;
end $$;

revoke all on function public.create_business_bank_invoice_with_billing(uuid,uuid,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.create_business_bank_invoice_with_billing(uuid,uuid,numeric,jsonb) to service_role;
commit;
