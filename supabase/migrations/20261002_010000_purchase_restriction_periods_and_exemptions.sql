begin;

alter table public.product_purchase_restrictions
  drop constraint if exists product_purchase_restrictions_reset_mode_check;
alter table public.product_purchase_restrictions
  add constraint product_purchase_restrictions_reset_mode_check
  check (reset_mode in ('ROLLING_1_DAY', 'ROLLING_7_DAYS', 'ROLLING_30_DAYS', 'CALENDAR_WEEK'));

alter table public.product_purchase_restrictions
  alter column notification_message set default 'Purchase limit reached. Please try again after your limit resets.';
update public.product_purchase_restrictions
  set notification_message = 'Purchase limit reached. Please try again after your limit resets.'
  where notification_message = 'Weekly purchase limit reached. Please try again after your limit resets.';

create table if not exists public.product_purchase_restriction_exemptions (
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);
alter table public.product_purchase_restriction_exemptions enable row level security;
revoke all on public.product_purchase_restriction_exemptions from public, anon, authenticated;
grant select, insert, update, delete on public.product_purchase_restriction_exemptions to service_role;
comment on table public.product_purchase_restriction_exemptions is
  'Admin-managed per-product purchase-value limit exemptions, matched only to authenticated user IDs. Quantity and payment restrictions still apply.';
comment on column public.product_purchase_restrictions.reset_mode is
  'Rolling 24-hour, 7-day, or 30-day purchase history window; legacy calendar weeks use Monday 00:00 UTC.';
notify pgrst, 'reload schema';

commit;
