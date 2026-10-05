begin;

alter table public.business_kyb add column if not exists password_setup_required_at timestamptz;
alter table public.business_kyb add column if not exists setup_email_requested_at timestamptz;

-- New activations require a new password. Existing accounts keep their current password.
create or replace function public.require_business_password_setup()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='APPROVED' and (TG_OP='INSERT' or old.status is distinct from 'APPROVED') then
    new.password_setup_required_at=clock_timestamp();
    new.setup_email_requested_at=null;
  end if;
  return new;
end $$;
revoke all on function public.require_business_password_setup() from public,anon,authenticated;
drop trigger if exists require_business_password_setup on public.business_kyb;
create trigger require_business_password_setup before insert or update of status on public.business_kyb
for each row execute function public.require_business_password_setup();

create or replace function public.business_security_status(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'approved',exists(select 1 from public.business_kyb b where b.user_id=p_user and b.status='APPROVED'),
    'password_ready',exists(select 1 from public.business_kyb b join public.account_password_age a on a.user_id=b.user_id
      where b.user_id=p_user and a.has_password and a.password_changed_at is not null
      and (b.password_setup_required_at is null or a.password_changed_at>=b.password_setup_required_at)),
    'totp_ready',exists(select 1 from auth.mfa_factors f where f.user_id=p_user and f.factor_type='totp' and f.status='verified')
  );
$$;

-- Atomic cooldown prevents duplicate admin clicks from sending repeated recovery emails.
create or replace function public.claim_business_setup_email(p_admin uuid,p_user uuid default null,p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.business_kyb; customer_email text;
begin
  if not exists(select 1 from public.admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  select b.* into r from public.business_kyb b join auth.users u on u.id=b.user_id
    where (case when p_user is not null then b.user_id=p_user else lower(u.email)=lower(btrim(p_email)) end)
    and b.status='APPROVED' and u.email_confirmed_at is not null for update of b;
  if not found then raise exception 'Approved business account not found.'; end if;
  select email into customer_email from auth.users where id=r.user_id;
  if r.setup_email_requested_at>now()-interval '60 seconds' then raise exception 'Please wait one minute before resending the setup email.'; end if;
  update public.business_kyb set setup_email_requested_at=now() where user_id=r.user_id;
  return jsonb_build_object('user_id',r.user_id,'email',customer_email);
end $$;

revoke all on function public.business_security_status(uuid),public.claim_business_setup_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.business_security_status(uuid),public.claim_business_setup_email(uuid,uuid,text) to service_role;
commit;
