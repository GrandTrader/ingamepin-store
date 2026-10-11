begin;

-- Preserve existing eligibility; the global bank switch still applies.
alter table public.business_kyb add column bank_transfer_enabled boolean not null default true;

create function public.set_business_bank_transfer_access(p_admin uuid,p_user uuid,p_enabled boolean,p_revision integer)
returns integer language plpgsql security definer set search_path=public as $$
declare account business_kyb;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  if p_enabled is null or p_revision is null or p_revision<1 then raise exception 'Refresh the customer details and try again.'; end if;
  select * into account from business_kyb where user_id=p_user for update;
  if not found then raise exception 'Business account not found.'; end if;
  if account.revision<>p_revision then raise exception 'Account changed. Refresh the customer details and try again.'; end if;
  if account.bank_transfer_enabled=p_enabled then return account.revision; end if;
  update business_kyb set bank_transfer_enabled=p_enabled,revision=revision+1 where user_id=p_user;
  insert into business_kyb_events(user_id,actor_id,status,note,revision)
  values(p_user,p_admin,'BANK_TRANSFER_ACCESS',case when p_enabled then 'Direct Bank Transfer enabled' else 'Direct Bank Transfer disabled' end,account.revision+1);
  return account.revision+1;
end $$;

-- Enforce at insertion, including legacy invoice/deposit RPCs and stale forms.
-- A share lock makes permission changes atomic with new invoice/deposit creation.
-- Existing deposits can still be reviewed; this switch never credits a wallet.
create function public.guard_business_bank_transfer_access() returns trigger
language plpgsql security definer set search_path=public as $$
declare account business_kyb;
begin
  select * into account from business_kyb where user_id=new.user_id for share;
  if not found or account.status<>'APPROVED' then raise exception 'Approved business verification is required.'; end if;
  if not account.bank_transfer_enabled then raise exception 'Direct Bank Transfer is disabled for your account. Contact support.'; end if;
  return new;
end $$;
create trigger business_invoice_customer_access before insert on public.business_bank_invoices
for each row execute function public.guard_business_bank_transfer_access();
create trigger business_deposit_customer_access before insert on public.business_bank_deposits
for each row execute function public.guard_business_bank_transfer_access();

revoke all on function public.set_business_bank_transfer_access(uuid,uuid,boolean,integer),public.guard_business_bank_transfer_access() from public,anon,authenticated;
grant execute on function public.set_business_bank_transfer_access(uuid,uuid,boolean,integer) to service_role;
comment on column public.business_kyb.bank_transfer_enabled is 'Admin-controlled bank invoice/deposit permission. Approved KYB, enabled bank settings and enabled wallet are still required.';
commit;
