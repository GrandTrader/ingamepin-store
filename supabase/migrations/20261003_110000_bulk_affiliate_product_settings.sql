begin;

create or replace function public.save_displayed_affiliate_products(p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_locked integer := 0;
  v_id uuid;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Product settings must be a list.';
  end if;
  v_count := jsonb_array_length(p_changes);
  if v_count < 1 or v_count > 5000 then
    raise exception 'Choose between 1 and 5000 products.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_changes) as e(value)
    where jsonb_typeof(value) <> 'object'
      or jsonb_typeof(value->'id') is distinct from 'string'
      or jsonb_typeof(value->'enabled') is distinct from 'boolean'
      or jsonb_typeof(value->'commission') is distinct from 'number'
  ) then raise exception 'Invalid product settings.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as x(id uuid, enabled boolean, commission numeric)
    where commission < 0 or commission > 25 or commission <> round(commission, 2)
      or (enabled and commission <= 0)
  ) then raise exception 'Enabled products need a commission above 0 and up to 25 percent, with up to two decimal places.'; end if;
  if (select count(distinct id) from jsonb_to_recordset(p_changes) as x(id uuid)) <> v_count then
    raise exception 'Duplicate product settings.';
  end if;

  -- Lock the exact displayed IDs in a consistent order. Missing products abort the whole save.
  for v_id in
    select p.id from public.products p
    join jsonb_to_recordset(p_changes) as x(id uuid) on x.id = p.id
    order by p.id for update of p
  loop v_locked := v_locked + 1; end loop;
  if v_locked <> v_count then raise exception 'A displayed product no longer exists. Refresh the list.'; end if;

  update public.products p set
    affiliate_enabled = x.enabled,
    affiliate_commission_percent = x.commission,
    affiliate_updated_at = now(), updated_at = now()
  from jsonb_to_recordset(p_changes) as x(id uuid, enabled boolean, commission numeric)
  where p.id = x.id;
  return v_count;
end;
$$;

revoke all on function public.save_displayed_affiliate_products(jsonb) from public, anon, authenticated;
grant execute on function public.save_displayed_affiliate_products(jsonb) to service_role;
comment on function public.save_displayed_affiliate_products(jsonb) is
  'Admin server action only: atomically saves affiliate settings for the exact displayed product IDs. Unlisted products and earned commissions are untouched.';

notify pgrst, 'reload schema';
commit;
