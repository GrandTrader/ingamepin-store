begin;

create sequence public.business_bank_invoice_number_seq;
create table public.business_bank_invoices (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  invoice_number text not null unique default ('IGP-PI-' || to_char(current_timestamp at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.business_bank_invoice_number_seq')::text,8,'0')),
  amount_usd numeric(12,2) not null check(amount_usd between 10 and 50000),
  buyer jsonb not null,
  bank_instructions jsonb not null,
  created_at timestamptz not null default now()
);
create index business_bank_invoices_customer on public.business_bank_invoices(user_id,created_at desc);
alter table public.business_bank_invoices enable row level security;
revoke all on public.business_bank_invoices from public,anon,authenticated;
revoke all on sequence public.business_bank_invoice_number_seq from public,anon,authenticated;
grant select on public.business_bank_invoices to service_role;
alter table public.business_bank_deposits add column invoice_id uuid unique references public.business_bank_invoices(id);

create function public.create_business_bank_invoice(p_id uuid,p_user uuid,p_amount numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare existing business_bank_invoices; settings business_bank_settings; details jsonb; customer_email text;
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
  select * into settings from business_bank_settings where id=true and enabled=true for share;
  if not found then raise exception 'Bank deposits are not available right now.'; end if;
  if (select count(*) from business_bank_invoices where user_id=p_user and created_at>now()-interval '24 hours')>=20 then raise exception 'You can generate up to 20 bank invoices per day. Use an existing invoice or contact support.'; end if;
  insert into business_bank_invoices(id,user_id,amount_usd,buyer,bank_instructions)
  values(p_id,p_user,p_amount,jsonb_build_object('name',details->>'legal_name','address',details->>'address','country',details->>'country','registration_number',details->>'registration_number','email',customer_email),settings.instructions);
  return p_id;
end $$;

create function public.submit_business_invoice_deposit(p_id uuid,p_user uuid,p_invoice uuid,p_reference text,p_receipt text)
returns uuid language plpgsql security definer set search_path=public as $$
declare invoice business_bank_invoices; existing business_bank_deposits; result uuid;
begin
  -- Match the existing deposit function's user-lock order, then lock the invoice.
  perform 1 from auth.users where id=p_user for update;
  select * into invoice from business_bank_invoices where id=p_invoice and user_id=p_user for update;
  if not found then raise exception 'Invoice not found.'; end if;
  select * into existing from business_bank_deposits where invoice_id=p_invoice;
  if found then return existing.id; end if;
  if exists(select 1 from business_bank_deposits where id=p_id) then raise exception 'Deposit reference already used.'; end if;
  if length(btrim(coalesce(p_reference,''))) not between 3 and 100 then raise exception 'Enter the bank transfer reference (3–100 characters).'; end if;
  result:=request_business_bank_deposit(p_id,p_user,invoice.amount_usd,invoice.buyer->>'name',invoice.invoice_number || ' / ' || btrim(p_reference),p_receipt);
  update business_bank_deposits set invoice_id=p_invoice,instructions_snapshot=invoice.bank_instructions where id=result;
  return result;
end $$;
revoke all on function public.create_business_bank_invoice(uuid,uuid,numeric),public.submit_business_invoice_deposit(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_business_bank_invoice(uuid,uuid,numeric),public.submit_business_invoice_deposit(uuid,uuid,uuid,text,text) to service_role;
comment on table public.business_bank_invoices is 'Immutable pro forma bank-deposit requests. Creation does not record payment, tax, or wallet credit.';
commit;
