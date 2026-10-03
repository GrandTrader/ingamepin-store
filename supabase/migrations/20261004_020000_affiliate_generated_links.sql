begin;
create table if not exists public.affiliate_generated_links (
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_copied_at timestamptz not null default now(),
  primary key (affiliate_id, product_id)
);
alter table public.affiliate_generated_links enable row level security;
revoke all on public.affiliate_generated_links from public, anon, authenticated;
grant select, insert, update on public.affiliate_generated_links to service_role;

create or replace function public.record_affiliate_link_copy(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_affiliate uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to copy an affiliate link.'; end if;
  select a.id into v_affiliate from public.affiliate_accounts a
  join public.products p on p.id = p_product_id
  join public.affiliate_settings s on s.id = 1 and s.program_enabled
  where a.user_id = auth.uid() and a.status = 'APPROVED'
    and p.status = 'ACTIVE' and p.retail_enabled and p.affiliate_enabled
    and least(p.affiliate_commission_percent, coalesce(a.commission_override_percent, p.affiliate_commission_percent)) > 0;
  if v_affiliate is null then raise exception 'This affiliate link is unavailable.'; end if;
  insert into public.affiliate_generated_links (affiliate_id,product_id)
  values (v_affiliate,p_product_id)
  on conflict (affiliate_id,product_id) do update set last_copied_at = now();
end;
$$;
revoke all on function public.record_affiliate_link_copy(uuid) from public, anon;
grant execute on function public.record_affiliate_link_copy(uuid) to authenticated;
commit;
