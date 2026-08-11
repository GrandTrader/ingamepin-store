begin;

alter table public.affiliate_settings
  add column if not exists payout_fee numeric(12,2) not null default 3;

alter table public.affiliate_settings
  drop constraint if exists affiliate_settings_payout_fee_check;

alter table public.affiliate_settings
  add constraint affiliate_settings_payout_fee_check
  check (payout_fee = 3);

update public.affiliate_settings
set payout_fee = 3
where id = 1;

alter table public.affiliate_payout_requests
  add column if not exists fee_amount numeric(12,2) not null default 3,
  add column if not exists net_amount numeric(12,2);

update public.affiliate_payout_requests
set
  fee_amount = 3,
  net_amount = greatest(amount - 3, 0)
where net_amount is null;

alter table public.affiliate_payout_requests
  alter column net_amount set not null;

alter table public.affiliate_payout_requests
  drop constraint if exists affiliate_payout_requests_fee_amount_check;

alter table public.affiliate_payout_requests
  drop constraint if exists affiliate_payout_requests_net_amount_check;

alter table public.affiliate_payout_requests
  add constraint affiliate_payout_requests_fee_amount_check
    check (fee_amount = 3),
  add constraint affiliate_payout_requests_net_amount_check
    check (net_amount = amount - fee_amount and net_amount > 0);

create or replace function public.create_affiliate_payout_request(
  p_amount numeric,
  p_network text,
  p_wallet_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affiliate public.affiliate_accounts%rowtype;
  v_settings public.affiliate_settings%rowtype;
  v_available numeric(12,2);
  v_request_id uuid;
  v_fee numeric(12,2);
  v_net_amount numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  perform public.release_mature_affiliate_commissions();

  select * into v_affiliate
  from public.affiliate_accounts
  where user_id = auth.uid()
    and status = 'APPROVED'
  for update;

  if not found then
    raise exception 'An approved affiliate account is required.';
  end if;

  select * into v_settings
  from public.affiliate_settings
  where id = 1;

  if not v_settings.program_enabled then
    raise exception 'Affiliate payouts are currently disabled.';
  end if;

  p_network := upper(btrim(coalesce(p_network, '')));
  p_wallet_address := btrim(coalesce(p_wallet_address, ''));

  if not (p_network = any(v_settings.payout_networks)) then
    raise exception 'The selected payout network is not supported.';
  end if;

  if char_length(p_wallet_address) < 20 or char_length(p_wallet_address) > 150 then
    raise exception 'Enter a valid payout wallet address.';
  end if;

  select coalesce(sum(commission_amount), 0)
  into v_available
  from public.affiliate_commissions
  where affiliate_id = v_affiliate.id
    and status = 'AVAILABLE';

  p_amount := round(coalesce(p_amount, 0), 2);
  v_fee := v_settings.payout_fee;
  v_net_amount := p_amount - v_fee;

  if p_amount < v_settings.minimum_payout then
    raise exception 'The minimum payout request is % USDT.', v_settings.minimum_payout;
  end if;

  if p_amount <= v_fee then
    raise exception 'The payout amount must be greater than the 3 USDT fee.';
  end if;

  if p_amount > v_available then
    raise exception 'The requested amount exceeds the available balance.';
  end if;

  if p_amount <> round(v_available, 2) then
    raise exception 'Payout requests must use the full available balance.';
  end if;

  insert into public.affiliate_payout_requests (
    affiliate_id,
    amount,
    fee_amount,
    net_amount,
    network,
    wallet_address
  ) values (
    v_affiliate.id,
    p_amount,
    v_fee,
    v_net_amount,
    p_network,
    p_wallet_address
  ) returning id into v_request_id;

  update public.affiliate_commissions
  set
    status = 'REQUESTED',
    payout_request_id = v_request_id,
    updated_at = now()
  where affiliate_id = v_affiliate.id
    and status = 'AVAILABLE';

  if (
    select coalesce(sum(commission_amount), 0)
    from public.affiliate_commissions
    where payout_request_id = v_request_id
  ) <> p_amount then
    raise exception 'The available commission balance changed. Please try again.';
  end if;

  update public.affiliate_accounts
  set
    payout_network = p_network,
    payout_address = p_wallet_address,
    updated_at = now()
  where id = v_affiliate.id;

  return v_request_id;
end;
$$;

revoke all on function public.create_affiliate_payout_request(
  numeric,
  text,
  text
) from public;

grant execute on function public.create_affiliate_payout_request(
  numeric,
  text,
  text
) to authenticated;

commit;
