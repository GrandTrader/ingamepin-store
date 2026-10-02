begin;
create table public.digiseller_price_settings (
  product_id uuid primary key references public.products(id) on delete cascade,
  adjustment_percent numeric(7,2) not null default 0 check (adjustment_percent between -99.99 and 1000),
  last_synced_at timestamptz,
  recovery_snapshot jsonb,
  sync_token uuid,
  started_at timestamptz,
  last_error text
);
alter table public.digiseller_price_settings enable row level security;
revoke all on public.digiseller_price_settings from public, anon, authenticated;
grant select on public.digiseller_price_settings to service_role;

create function public.begin_digiseller_price_sync(p_product_id uuid, p_snapshot jsonb, p_recover boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.digiseller_price_settings%rowtype; t uuid:=gen_random_uuid();
begin
  insert into digiseller_price_settings(product_id) values(p_product_id) on conflict do nothing;
  select * into s from digiseller_price_settings where product_id=p_product_id for update;
  if s.sync_token is not null and s.started_at>now()-interval '15 minutes' then raise exception 'A DigiSeller price update is already running. Please wait.'; end if;
  if p_recover then
    if s.recovery_snapshot is null then raise exception 'No prices need restoring.'; end if;
  else
    if s.recovery_snapshot is not null then raise exception 'Restore the previous prices before starting another update.'; end if;
    if p_snapshot is null or jsonb_typeof(p_snapshot)<>'array' or jsonb_array_length(p_snapshot)=0 then raise exception 'Missing price backup.'; end if;
  end if;
  update digiseller_price_settings set sync_token=t,started_at=now(),last_error=null,
    recovery_snapshot=case when p_recover then recovery_snapshot else p_snapshot end where product_id=p_product_id;
  return t;
end $$;

create function public.finish_digiseller_price_sync(p_product_id uuid,p_token uuid,p_percent numeric,p_success boolean,p_restored boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_success and (p_percent is null or p_percent::text in ('NaN','Infinity','-Infinity') or p_percent not between -99.99 and 1000) then raise exception 'Invalid adjustment.'; end if;
  update digiseller_price_settings set
    adjustment_percent=case when p_success then p_percent else adjustment_percent end,
    last_synced_at=case when p_success then now() else last_synced_at end,
    recovery_snapshot=case when p_success or p_restored then null else recovery_snapshot end,
    sync_token=null,last_error=left(p_error,500)
  where product_id=p_product_id and sync_token=p_token;
  if not found then raise exception 'The price update lock was lost.'; end if;
end $$;
revoke all on function public.begin_digiseller_price_sync(uuid,jsonb,boolean),public.finish_digiseller_price_sync(uuid,uuid,numeric,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.begin_digiseller_price_sync(uuid,jsonb,boolean),public.finish_digiseller_price_sync(uuid,uuid,numeric,boolean,boolean,text) to service_role;
commit;
