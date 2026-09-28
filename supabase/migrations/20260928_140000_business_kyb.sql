begin;

create table public.business_kyb (
  user_id uuid primary key references auth.users(id),
  status text not null check (status in ('PENDING','APPROVED','REJECTED','REVOKED')),
  details jsonb not null,
  documents jsonb not null,
  revision integer not null default 1,
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);
create table public.business_kyb_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  actor_id uuid not null references auth.users(id), status text not null, note text,
  revision integer not null, created_at timestamptz not null default now()
);
create table public.business_bank_settings (
  id boolean primary key default true check(id), enabled boolean not null default false,
  instructions jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
-- Bank details are intentionally not seeded into a public table or enabled.
insert into public.business_bank_settings(id) values(true);
create table public.business_bank_deposits (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  amount_usd numeric(12,2) not null check(amount_usd between 10 and 50000),
  sender_name text not null, customer_reference text not null, receipt_path text not null,
  status text not null default 'PENDING' check(status in ('PENDING','CREDITED','REJECTED')),
  bank_reference text, received_currency text check(received_currency in ('USD','INR')),
  received_amount numeric(14,2), inr_per_usd numeric(14,6), credited_usd numeric(12,2),
  wallet_transaction_id uuid references public.wallet_transactions(id),
  note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  instructions_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create unique index business_deposit_bank_reference on public.business_bank_deposits(lower(btrim(bank_reference))) where status='CREDITED';
create index business_deposit_customer on public.business_bank_deposits(user_id,created_at desc);
create index business_kyb_status on public.business_kyb(status,submitted_at);

alter table public.business_kyb enable row level security;
alter table public.business_kyb_events enable row level security;
alter table public.business_bank_settings enable row level security;
alter table public.business_bank_deposits enable row level security;
revoke all on public.business_kyb,public.business_kyb_events,public.business_bank_settings,public.business_bank_deposits from public,anon,authenticated;
grant select on public.business_kyb,public.business_kyb_events,public.business_bank_settings,public.business_bank_deposits to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('business-verification','business-verification',false,1048576,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=1048576,allowed_mime_types=excluded.allowed_mime_types;
-- Even a broader storage policy must not expose or allow replacement of KYB evidence.
create policy business_documents_server_only on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'business-verification') with check (bucket_id <> 'business-verification');

create function public.submit_business_kyb(p_user uuid,p_details jsonb,p_documents jsonb,p_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare r business_kyb; k text;
begin
  perform 1 from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'Verify your account email before applying.'; end if;
  select * into r from business_kyb where user_id=p_user for update;
  if found and (r.status not in ('REJECTED','REVOKED') or r.revision<>p_revision) then
    raise exception 'Your application changed or is already under review. Refresh the page.';
  end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or pg_column_size(p_details)>20000
    or coalesce(p_details->>'buyer_type','') not in ('RESELLER','BULK_BUYER','BOTH')
    or coalesce(p_details->>'consent','')<>'business-kyb-v1' then raise exception 'Invalid business application.'; end if;
  foreach k in array array['legal_name','entity_type','registration_number','country','address','contact_name','phone','activity','owners'] loop
    if length(btrim(coalesce(p_details->>k,'')))<2 then raise exception 'Complete the business details.'; end if;
  end loop;
  foreach k in array array['registration','address','ownership'] loop
    if coalesce(p_documents->>k,'') not like p_user::text||'/%' or not exists(select 1 from storage.objects where bucket_id='business-verification' and name=p_documents->>k) then raise exception 'Upload all required documents.'; end if;
  end loop;
  insert into business_kyb(user_id,status,details,documents,revision) values(p_user,'PENDING',p_details,p_documents,coalesce(r.revision,0)+1)
  on conflict(user_id) do update set status='PENDING',details=excluded.details,documents=excluded.documents,
    revision=excluded.revision,review_note=null,reviewed_by=null,reviewed_at=null,submitted_at=now();
  insert into business_kyb_events(user_id,actor_id,status,revision,note) values(p_user,p_user,'PENDING',coalesce(r.revision,0)+1,'Application submitted');
end $$;

create function public.review_business_kyb(p_user uuid,p_admin uuid,p_revision integer,p_status text,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare r business_kyb;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  select * into r from business_kyb where user_id=p_user for update;
  if not found or r.revision<>p_revision then raise exception 'Application changed. Refresh before reviewing.'; end if;
  if not ((r.status='PENDING' and p_status in ('APPROVED','REJECTED')) or (r.status='APPROVED' and p_status='REVOKED')) then
    raise exception 'This review is no longer available.';
  end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Enter a review note (3–1000 characters).'; end if;
  update business_kyb set status=p_status,review_note=btrim(p_note),reviewed_by=p_admin,reviewed_at=now(),revision=revision+1 where user_id=p_user;
  insert into business_kyb_events(user_id,actor_id,status,revision,note) values(p_user,p_admin,p_status,r.revision+1,btrim(p_note));
end $$;

create function public.require_approved_business(p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_user is null or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then
    raise exception 'Sign in with a verified business account and complete KYB at /account/business.';
  end if;
  perform 1 from business_kyb where user_id=p_user and status='APPROVED' for share;
  if not found then raise exception 'Approved business verification is required. Apply at /account/business.'; end if;
end $$;

create function public.guard_business_order_item() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid; v_order_email text; needs_kyb boolean;
begin
  actor:=coalesce(nullif(current_setting('app.business_buyer',true),'')::uuid,auth.uid());
  select customer_email into v_order_email from orders where id=NEW.order_id;
  select coalesce(is_bulk_order,false) into needs_kyb from products where id=NEW.product_id;
  needs_kyb:=coalesce(needs_kyb,false) or exists(
    select 1 from business_kyb k join auth.users u on u.id=k.user_id
    where (k.user_id=actor or lower(u.email)=lower(v_order_email)) and k.details->>'buyer_type' in ('RESELLER','BOTH')
  );
  if needs_kyb then
    perform require_approved_business(actor);
    if coalesce(current_setting('app.business_bulk_api',true),'')<>'yes' and
      not exists(select 1 from auth.users where id=actor and lower(auth.users.email)=lower(v_order_email)) then
      raise exception 'Use the email address of your approved business account.';
    end if;
  end if;
  return NEW;
end $$;
create trigger business_order_kyb before insert on public.order_items for each row execute function public.guard_business_order_item();

-- Service-only wrapper binds checkout to the authenticated user, never a user ID from the request body.
create function public.create_business_checked_order(p_customer_name text,p_customer_email text,p_customer_phone text,p_payment_method text,p_items jsonb,p_customer_note text default null,p_user uuid default null,p_bulk_client uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=p_user; result jsonb;
begin
  if p_bulk_client is not null then
    select u.id into actor from bulk_api_clients c join auth.users u on lower(u.email)=lower(c.contact_email)
    where c.id=p_bulk_client and c.status='ACTIVE' and u.email_confirmed_at is not null;
    perform require_approved_business(actor);
  end if;
  perform set_config('app.business_buyer',coalesce(actor::text,''),true);
  perform set_config('app.business_bulk_api',case when p_bulk_client is not null then 'yes' else 'no' end,true);
  result:=create_store_order(p_customer_name,p_customer_email,p_customer_phone,p_payment_method,p_items,p_customer_note);
  return result;
end $$;

create function public.save_business_bank_settings(p_admin uuid,p_enabled boolean,p_instructions jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare k text;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  if p_instructions is null or jsonb_typeof(p_instructions)<>'object' or pg_column_size(p_instructions)>12000 then raise exception 'Invalid bank instructions.'; end if;
  if p_enabled then
    foreach k in array array['beneficiary','account_number','beneficiary_address','bank','branch_address','ifsc','swift','routing_instructions'] loop
      if length(btrim(coalesce(p_instructions->>k,'')))<2 then raise exception 'Complete the SBI-confirmed transfer instructions before enabling.'; end if;
    end loop;
    if coalesce(p_instructions->>'bank_confirmed','')<>'yes' or coalesce(p_instructions->>'swift','') !~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$' then
      raise exception 'Confirm the international transfer instructions with SBI.';
    end if;
  end if;
  update business_bank_settings set enabled=p_enabled,instructions=p_instructions,updated_by=p_admin,updated_at=now() where id=true;
end $$;

create function public.request_business_bank_deposit(p_id uuid,p_user uuid,p_amount numeric,p_sender text,p_reference text,p_receipt text)
returns uuid language plpgsql security definer set search_path=public as $$
declare settings business_bank_settings;
begin
  perform require_approved_business(p_user);
  perform 1 from auth.users where id=p_user for update;
  if exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'wallet_disabled'='true') then raise exception 'Your wallet is disabled. Contact support.'; end if;
  select * into settings from business_bank_settings where id=true and enabled=true for share;
  if not found then raise exception 'USD bank deposits are not available yet.'; end if;
  if p_amount is null or p_amount<>round(p_amount,2) or p_amount not between 10 and 50000 then raise exception 'Enter USD 10–50,000 with at most two decimal places.'; end if;
  if length(btrim(coalesce(p_sender,''))) not between 2 and 160 or length(btrim(coalesce(p_reference,''))) not between 3 and 160 or coalesce(p_receipt,'') not like p_user::text||'/%' then raise exception 'Complete the sender, reference and receipt.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='business-verification' and name=p_receipt) then raise exception 'Upload a valid transfer receipt.'; end if;
  if exists(select 1 from business_bank_deposits where id=p_id and user_id=p_user) then return p_id; end if;
  if (select count(*) from business_bank_deposits where user_id=p_user and status='PENDING')>=3 then raise exception 'Wait for your pending bank deposits to be reviewed.'; end if;
  insert into business_bank_deposits(id,user_id,amount_usd,sender_name,customer_reference,receipt_path,instructions_snapshot)
  values(p_id,p_user,p_amount,btrim(p_sender),btrim(p_reference),p_receipt,settings.instructions);
  return p_id;
end $$;

create function public.review_business_bank_deposit(p_id uuid,p_admin uuid,p_status text,p_bank_reference text,p_currency text,p_received numeric,p_rate numeric,p_note text)
returns numeric language plpgsql security definer set search_path=public as $$
declare r business_bank_deposits; balance_before numeric; credit numeric; tid uuid; wallet_currency text;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  select * into r from business_bank_deposits where id=p_id for update;
  if not found then raise exception 'Deposit not found.'; end if;
  if r.status='CREDITED' and p_status='CREDITED' then return r.credited_usd; end if;
  if r.status<>'PENDING' then raise exception 'Deposit already reviewed.'; end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Enter a review note.'; end if;
  if p_status='REJECTED' then
    update business_bank_deposits set status='REJECTED',note=btrim(p_note),reviewed_by=p_admin,reviewed_at=now() where id=p_id;
    return 0;
  end if;
  if p_status is distinct from 'CREDITED' then raise exception 'Invalid decision.'; end if;
  perform require_approved_business(r.user_id);
  if exists(select 1 from auth.users where id=r.user_id and raw_app_meta_data->>'wallet_disabled'='true') then raise exception 'Customer wallet is disabled.'; end if;
  if length(btrim(coalesce(p_bank_reference,''))) not between 6 and 160 or p_currency is null or p_currency not in ('USD','INR')
     or p_received is null or p_received<=0 or p_received>100000000 or p_received<>round(p_received,2)
     or p_rate is null or p_rate<>round(p_rate,6) or p_rate<=0 or p_rate>100000 or (p_currency='USD' and p_rate<>1) then raise exception 'Enter verified bank receipt details and the conversion rate.'; end if;
  credit:=round(p_received / p_rate,2);
  if credit<=0 or credit>r.amount_usd then raise exception 'The USD credit must be positive and cannot exceed the declared deposit.'; end if;
  insert into customer_wallets(user_id) values(r.user_id) on conflict(user_id) do nothing;
  select balance,currency into balance_before,wallet_currency from customer_wallets where user_id=r.user_id for update;
  if wallet_currency<>'USD' then raise exception 'Only USD wallets are supported.'; end if;
  insert into wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,description,reference_id)
  values(r.user_id,'CREDIT',credit,balance_before,balance_before+credit,'SBI bank deposit '||p_id::text,p_id::text) returning id into tid;
  update customer_wallets set balance=balance_before+credit,updated_at=now() where user_id=r.user_id;
  update business_bank_deposits set status='CREDITED',bank_reference=btrim(p_bank_reference),received_currency=p_currency,
    received_amount=p_received,inr_per_usd=p_rate,credited_usd=credit,wallet_transaction_id=tid,note=btrim(p_note),reviewed_by=p_admin,reviewed_at=now() where id=p_id;
  return credit;
end $$;

revoke all on function public.submit_business_kyb(uuid,jsonb,jsonb,integer),public.review_business_kyb(uuid,uuid,integer,text,text),
  public.require_approved_business(uuid),public.guard_business_order_item(),public.create_business_checked_order(text,text,text,text,jsonb,text,uuid,uuid),
  public.save_business_bank_settings(uuid,boolean,jsonb),public.request_business_bank_deposit(uuid,uuid,numeric,text,text,text),
  public.review_business_bank_deposit(uuid,uuid,text,text,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.submit_business_kyb(uuid,jsonb,jsonb,integer),public.review_business_kyb(uuid,uuid,integer,text,text),
  public.create_business_checked_order(text,text,text,text,jsonb,text,uuid,uuid),public.save_business_bank_settings(uuid,boolean,jsonb),
  public.request_business_bank_deposit(uuid,uuid,numeric,text,text,text),public.review_business_bank_deposit(uuid,uuid,text,text,text,numeric,numeric,text) to service_role;

create function public.create_business_checked_seller_order(p_name text,p_email text,p_method text,p_items jsonb,p_note text,p_user uuid,p_ip text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform set_config('app.business_buyer',coalesce(p_user::text,''),true);
  perform set_config('app.business_bulk_api','no',true);
  execute 'select public.create_seller_store_order($1,$2,$3,$4,$5,$6,$7)' into result using p_name,p_email,p_method,p_items,p_note,p_user,p_ip;
  return result;
end $$;
revoke all on function public.create_business_checked_seller_order(text,text,text,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_business_checked_seller_order(text,text,text,jsonb,text,uuid,text) to service_role;
commit;
