begin;

create or replace function public.submit_affiliate_application(
  p_full_name text,
  p_country_code text,
  p_promotion_channel text,
  p_promotion_url text,
  p_promotion_plan text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_affiliate_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  p_full_name := btrim(coalesce(p_full_name, ''));
  p_country_code := upper(btrim(coalesce(p_country_code, '')));
  p_promotion_channel := upper(btrim(coalesce(p_promotion_channel, '')));
  p_promotion_url := nullif(btrim(coalesce(p_promotion_url, '')), '');
  p_promotion_plan := btrim(coalesce(p_promotion_plan, ''));

  if char_length(p_full_name) < 2 or char_length(p_full_name) > 120 then
    raise exception 'Enter a valid full name.';
  end if;

  if p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Select a valid country.';
  end if;

  if p_promotion_channel not in (
    'WEBSITE', 'YOUTUBE', 'TELEGRAM', 'SOCIAL_MEDIA', 'OTHER'
  ) then
    raise exception 'Select a valid promotion channel.';
  end if;

  if p_promotion_url is not null and char_length(p_promotion_url) > 500 then
    raise exception 'Promotion URL is too long.';
  end if;

  if char_length(p_promotion_plan) < 20 or char_length(p_promotion_plan) > 2000 then
    raise exception 'Promotion plan must contain between 20 and 2,000 characters.';
  end if;

  select id
  into v_account_id
  from public.affiliate_accounts
  where user_id = v_user_id
  for update;

  if found then
    if exists (
      select 1
      from public.affiliate_accounts
      where id = v_account_id
        and status in ('APPROVED', 'SUSPENDED')
    ) then
      raise exception 'This affiliate account cannot submit another application.';
    end if;

    update public.affiliate_accounts
    set
      status = 'PENDING',
      full_name = p_full_name,
      country_code = p_country_code,
      promotion_channel = p_promotion_channel,
      promotion_url = p_promotion_url,
      promotion_plan = p_promotion_plan,
      rejected_at = null,
      rejection_reason = null,
      updated_at = now()
    where id = v_account_id;

    return v_account_id;
  end if;

  loop
    v_affiliate_code :=
      'IGP-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));

    exit when not exists (
      select 1
      from public.affiliate_accounts
      where affiliate_code = v_affiliate_code
    );
  end loop;

  insert into public.affiliate_accounts (
    user_id,
    affiliate_code,
    full_name,
    country_code,
    promotion_channel,
    promotion_url,
    promotion_plan
  )
  values (
    v_user_id,
    v_affiliate_code,
    p_full_name,
    p_country_code,
    p_promotion_channel,
    p_promotion_url,
    p_promotion_plan
  )
  returning id into v_account_id;

  return v_account_id;
end;
$$;

revoke all on function public.submit_affiliate_application(
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.submit_affiliate_application(
  text,
  text,
  text,
  text,
  text
) to authenticated;

commit;
