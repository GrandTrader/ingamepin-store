begin;

create table if not exists public.affiliate_product_rates (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null
    references public.affiliate_accounts(id) on delete cascade,
  product_id uuid not null
    references public.products(id) on delete cascade,
  commission_percent numeric(5,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (affiliate_id, product_id),
  constraint affiliate_product_rates_commission_check
    check (commission_percent between 0.01 and 25)
);

create index if not exists affiliate_product_rates_affiliate_idx
  on public.affiliate_product_rates(affiliate_id, product_id);

alter table public.affiliate_product_rates enable row level security;

revoke all on table public.affiliate_product_rates from anon, authenticated;
grant select on table public.affiliate_product_rates to authenticated;

drop policy if exists "Affiliates read own product rates"
  on public.affiliate_product_rates;

create policy "Affiliates read own product rates"
  on public.affiliate_product_rates
  for select
  to authenticated
  using (
    affiliate_id in (
      select id
      from public.affiliate_accounts
      where user_id = auth.uid()
    )
    or public.is_admin()
  );

create or replace function public.set_affiliate_product_commission(
  p_product_id uuid,
  p_commission_percent numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affiliate public.affiliate_accounts%rowtype;
  v_product public.products%rowtype;
  v_maximum numeric(5,2);
  v_selected numeric(5,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_affiliate
  from public.affiliate_accounts
  where user_id = auth.uid()
    and status = 'APPROVED'
  for update;

  if not found then
    raise exception 'An approved affiliate account is required.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
    and status = 'ACTIVE'
    and affiliate_enabled = true;

  if not found then
    raise exception 'This product is not available for affiliate promotion.';
  end if;

  v_maximum := coalesce(
    v_affiliate.commission_override_percent,
    v_product.affiliate_commission_percent
  );
  v_selected := round(coalesce(p_commission_percent, 0), 2);

  if v_maximum <= 0 then
    raise exception 'Affiliate commission is not enabled for this product.';
  end if;

  if v_selected < 0.01 or v_selected > v_maximum then
    raise exception 'Choose a commission between 0.01 and % percent.', v_maximum;
  end if;

  insert into public.affiliate_product_rates (
    affiliate_id,
    product_id,
    commission_percent
  )
  values (
    v_affiliate.id,
    v_product.id,
    v_selected
  )
  on conflict (affiliate_id, product_id)
  do update set
    commission_percent = excluded.commission_percent,
    updated_at = now();

  return v_selected;
end;
$$;

revoke all on function public.set_affiliate_product_commission(
  uuid,
  numeric
) from public;

grant execute on function public.set_affiliate_product_commission(
  uuid,
  numeric
) to authenticated;

commit;
