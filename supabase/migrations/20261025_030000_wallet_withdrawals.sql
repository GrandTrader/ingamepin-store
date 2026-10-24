-- Manual USDT payouts. Reserving funds debits the existing available-balance
-- ledger; releasing a request credits the gross amount once. Paying never debits again.
begin;

create table if not exists public.wallet_withdrawal_access (
  user_id uuid primary key references auth.users(id) on delete restrict,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  network text not null check (network in ('TRC20','BEP20','SOLANA')),
  network_fee numeric(12,2) not null,
  net_usdt numeric(12,2) generated always as (amount - network_fee) stored,
  wallet_address text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','PAID','REJECTED','CANCELLED')),
  transaction_id text,
  reason text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_key),
  check (network_fee = case network when 'TRC20' then 4.50 when 'BEP20' then 0.50 when 'SOLANA' then 2.50 end),
  check (amount > network_fee),
  check ((status = 'PAID') = (transaction_id is not null))
);
create unique index if not exists wallet_withdrawal_one_active
 on public.wallet_withdrawal_requests(user_id) where status in ('REQUESTED','APPROVED');
create unique index if not exists wallet_withdrawal_unique_transfer
 on public.wallet_withdrawal_requests(network,transaction_id) where transaction_id is not null;
create index if not exists wallet_withdrawal_customer_history
 on public.wallet_withdrawal_requests(user_id,created_at desc,id);
create index if not exists wallet_withdrawal_review_queue
 on public.wallet_withdrawal_requests(status,created_at desc,id);
create table if not exists public.wallet_withdrawal_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.wallet_withdrawal_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.wallet_withdrawal_access enable row level security;
alter table public.wallet_withdrawal_requests enable row level security;
alter table public.wallet_withdrawal_events enable row level security;
drop policy if exists withdrawal_access_read on public.wallet_withdrawal_access;
create policy withdrawal_access_read on public.wallet_withdrawal_access for select to authenticated using(user_id=auth.uid());
drop policy if exists withdrawal_request_read on public.wallet_withdrawal_requests;
create policy withdrawal_request_read on public.wallet_withdrawal_requests for select to authenticated using(user_id=auth.uid());
drop policy if exists withdrawal_events_read on public.wallet_withdrawal_events;
create policy withdrawal_events_read on public.wallet_withdrawal_events for select to authenticated using(user_id=auth.uid());
revoke all on public.wallet_withdrawal_access,public.wallet_withdrawal_requests,public.wallet_withdrawal_events from anon,authenticated;
grant select on public.wallet_withdrawal_access,public.wallet_withdrawal_requests,public.wallet_withdrawal_events to authenticated;
grant all on public.wallet_withdrawal_access,public.wallet_withdrawal_requests,public.wallet_withdrawal_events to service_role;

create or replace function public.set_wallet_withdrawal_access(p_user_id uuid,p_enabled boolean,p_admin_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_admin_user_id) then raise exception 'Administrator access is required.'; end if;
  if p_enabled is null then raise exception 'Select withdrawal access.'; end if;
  insert into public.wallet_withdrawal_access(user_id,enabled,updated_by)
    values(p_user_id,p_enabled,p_admin_user_id)
    on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  insert into public.wallet_withdrawal_events(user_id,actor_id,event)
    values(p_user_id,p_admin_user_id,case when p_enabled then 'ACCESS_ENABLED' else 'ACCESS_DISABLED' end);
end; $$;

create or replace function public.request_wallet_withdrawal(p_request_key uuid,p_amount numeric,p_network text,p_wallet_address text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); prior public.wallet_withdrawal_requests%rowtype;
  before_balance numeric(12,2); wallet_currency text; fee numeric(12,2); rid uuid;
  address text:=btrim(p_wallet_address); permitted boolean;
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Sign in with a verified email to request a withdrawal.';
  end if;
  if p_request_key is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Enter a valid amount with at most two decimal places.';
  end if;
  fee:=case p_network when 'TRC20' then 4.50 when 'BEP20' then 0.50 when 'SOLANA' then 2.50 end;
  if fee is null or p_amount<=fee then raise exception 'Amount must be greater than the selected network fee.'; end if;
  if address is null or not(case p_network
    when 'TRC20' then address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
    when 'BEP20' then address ~ '^0x[0-9a-fA-F]{40}$'
    when 'SOLANA' then address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    else false end) then raise exception 'Enter a valid wallet address for the selected network.'; end if;
  if p_network='BEP20' then address:=lower(address); end if;
  -- Access lock serializes duplicate submissions and disable-vs-create races.
  select enabled into permitted from public.wallet_withdrawal_access where user_id=uid for update;
  select * into prior from public.wallet_withdrawal_requests where user_id=uid and request_key=p_request_key;
  if found then
    if prior.amount<>p_amount or prior.network<>p_network or prior.wallet_address<>address then
      raise exception 'This request reference has already been used with different details.';
    end if;
    return prior.id;
  end if;
  if permitted is distinct from true then raise exception 'Withdrawals are not enabled for your account. Contact support.'; end if;
  if exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'wallet_disabled'='true') then
    raise exception 'Your wallet is disabled. Contact support.';
  end if;
  if exists(select 1 from public.wallet_withdrawal_requests where user_id=uid and status in ('REQUESTED','APPROVED')) then
    raise exception 'You already have a pending withdrawal. View it in withdrawal history.';
  end if;
  -- All checkout and withdrawal operations lock this same wallet row.
  select balance,currency into before_balance,wallet_currency from public.customer_wallets where user_id=uid for update;
  if not found or before_balance<p_amount then raise exception 'Insufficient available wallet balance.'; end if;
  if wallet_currency<>'USD' then raise exception 'USDT withdrawals require a USD wallet.'; end if;
  insert into public.wallet_withdrawal_requests(user_id,request_key,amount,network,network_fee,wallet_address)
    values(uid,p_request_key,p_amount,p_network,fee,address) returning id into rid;
  update public.customer_wallets set balance=before_balance-p_amount,updated_at=now() where user_id=uid;
  insert into public.wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,description,reference_id)
    values(uid,'DEBIT',p_amount,before_balance,before_balance-p_amount,'Crypto withdrawal reserved ('||p_network||')',rid::text);
  insert into public.wallet_withdrawal_events(request_id,user_id,actor_id,event,note)
    values(rid,uid,uid,'REQUESTED','Gross amount reserved. Fixed network fee included; USD 1 = USDT 1.');
  return rid;
end; $$;

create or replace function public.cancel_wallet_withdrawal(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.wallet_withdrawal_requests%rowtype; before_balance numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into r from public.wallet_withdrawal_requests where id=p_request_id and user_id=auth.uid() for update;
  if not found then raise exception 'Withdrawal request was not found.'; end if;
  if r.status='CANCELLED' then return; end if;
  if r.status<>'REQUESTED' then raise exception 'Only a withdrawal awaiting review can be cancelled.'; end if;
  select balance into before_balance from public.customer_wallets where user_id=r.user_id for update;
  if not found then raise exception 'Wallet was not found.'; end if;
  update public.customer_wallets set balance=before_balance+r.amount,updated_at=now() where user_id=r.user_id;
  insert into public.wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,description,reference_id)
    values(r.user_id,'CREDIT',r.amount,before_balance,before_balance+r.amount,'Cancelled crypto withdrawal released',r.id::text);
  update public.wallet_withdrawal_requests set status='CANCELLED',completed_at=now(),updated_at=now() where id=r.id;
  insert into public.wallet_withdrawal_events(request_id,user_id,actor_id,event)
    values(r.id,r.user_id,auth.uid(),'CANCELLED');
end; $$;

create or replace function public.review_wallet_withdrawal(p_request_id uuid,p_admin_user_id uuid,p_action text,p_note text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.wallet_withdrawal_requests%rowtype; before_balance numeric(12,2); note text:=btrim(coalesce(p_note,''));
begin
  if not exists(select 1 from public.admin_users where user_id=p_admin_user_id) then raise exception 'Administrator access is required.'; end if;
  if p_action not in ('APPROVE','REJECT','PAY') or p_action is null then raise exception 'Choose a valid withdrawal action.'; end if;
  select * into r from public.wallet_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request was not found.'; end if;
  if r.network in ('TRC20','BEP20') and p_action='PAY' then note:=lower(note); end if;
  if r.status='PAID' and p_action='PAY' and r.transaction_id=note then return; end if;
  if r.status='REJECTED' and p_action='REJECT' then return; end if;
  -- The approving administrator owns the manual transfer, preventing two operators
  -- from independently sending the same payout from different admin sessions.
  if r.status='APPROVED' and r.reviewed_by is distinct from p_admin_user_id then
    raise exception 'This payout is assigned to the administrator who approved it.';
  end if;
  if p_action='APPROVE' then
    if r.status='APPROVED' then return; end if;
    if r.status<>'REQUESTED' then raise exception 'Only an awaiting-review withdrawal can be approved.'; end if;
    update public.wallet_withdrawal_requests set status='APPROVED',reviewed_by=p_admin_user_id,reviewed_at=now(),updated_at=now() where id=r.id;
  elsif p_action='REJECT' then
    if r.status not in ('REQUESTED','APPROVED') then raise exception 'This withdrawal cannot be rejected.'; end if;
    if length(note)<3 or length(note)>500 then raise exception 'Enter a rejection reason (3-500 characters).'; end if;
    select balance into before_balance from public.customer_wallets where user_id=r.user_id for update;
    if not found then raise exception 'Wallet was not found.'; end if;
    update public.customer_wallets set balance=before_balance+r.amount,updated_at=now() where user_id=r.user_id;
    insert into public.wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,description,reference_id)
      values(r.user_id,'CREDIT',r.amount,before_balance,before_balance+r.amount,'Rejected crypto withdrawal released',r.id::text);
    update public.wallet_withdrawal_requests set status='REJECTED',reason=note,reviewed_by=p_admin_user_id,reviewed_at=now(),completed_at=now(),updated_at=now() where id=r.id;
  else
    if r.status<>'APPROVED' then raise exception 'Approve the withdrawal before recording its transfer.'; end if;
    if not(case r.network
      when 'TRC20' then note ~ '^[0-9a-f]{64}$'
      when 'BEP20' then note ~ '^0x[0-9a-f]{64}$'
      when 'SOLANA' then note ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'
      else false end) then raise exception 'Enter a valid transaction hash for the selected network.'; end if;
    update public.wallet_withdrawal_requests set status='PAID',transaction_id=note,completed_at=now(),updated_at=now() where id=r.id;
  end if;
  insert into public.wallet_withdrawal_events(request_id,user_id,actor_id,event,note)
    values(r.id,r.user_id,p_admin_user_id,case p_action when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' else 'PAID' end,nullif(note,''));
end; $$;

revoke all on function public.set_wallet_withdrawal_access(uuid,boolean,uuid) from public,anon,authenticated;
revoke all on function public.review_wallet_withdrawal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_wallet_withdrawal_access(uuid,boolean,uuid),public.review_wallet_withdrawal(uuid,uuid,text,text) to service_role;
revoke all on function public.request_wallet_withdrawal(uuid,numeric,text,text),public.cancel_wallet_withdrawal(uuid) from public,anon;
grant execute on function public.request_wallet_withdrawal(uuid,numeric,text,text),public.cancel_wallet_withdrawal(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
