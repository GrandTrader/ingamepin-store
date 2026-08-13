begin;

alter table public.products
  add column if not exists review_reward_enabled boolean not null default false,
  add column if not exists review_reward_percent numeric(5, 2) not null default 0;

alter table public.products
  drop constraint if exists products_review_reward_percent_check;

alter table public.products
  add constraint products_review_reward_percent_check
  check (review_reward_percent >= 0 and review_reward_percent <= 100);

alter table public.order_reviews
  add column if not exists reward_percent numeric(5, 2) not null default 0,
  add column if not exists reward_amount numeric(12, 2) not null default 0,
  add column if not exists reward_transaction_id uuid
    references public.wallet_transactions(id) on delete set null;

create table if not exists public.review_support_cases (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique
    references public.order_reviews(id) on delete cascade,
  order_id uuid not null
    references public.orders(id) on delete cascade,
  customer_id uuid
    references auth.users(id) on delete set null,
  customer_email text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'RESOLVED')),
  resolution_note text,
  resolution_credit numeric(12, 2) not null default 0
    check (resolution_credit >= 0),
  resolution_transaction_id uuid
    references public.wallet_transactions(id) on delete set null,
  resolved_by uuid
    references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_support_cases_status_created_idx
  on public.review_support_cases(status, created_at desc);

alter table public.review_support_cases enable row level security;

revoke all on table public.review_support_cases from anon, authenticated;
grant select on table public.review_support_cases to authenticated;

drop policy if exists "Admins read review support cases"
  on public.review_support_cases;

create policy "Admins read review support cases"
  on public.review_support_cases
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.submit_verified_order_review(
  p_order_id uuid,
  p_customer_id uuid,
  p_customer_email text,
  p_sentiment text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_review_id uuid;
  v_reward_percent numeric(5, 2) := 0;
  v_reward_amount numeric(12, 2) := 0;
  v_balance_before numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_transaction_id uuid;
  v_support_case_id uuid;
begin
  if p_sentiment not in ('POSITIVE', 'NEGATIVE') then
    raise exception 'Choose a valid review rating.';
  end if;

  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'Review comments can contain up to 1000 characters.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order was not found.';
  end if;

  if v_order.status <> 'DELIVERED' then
    raise exception 'A review can be submitted only after delivery.';
  end if;

  if lower(v_order.customer_email) <> lower(trim(p_customer_email)) then
    raise exception 'Order ownership could not be verified.';
  end if;

  if p_customer_id is not null
     and v_order.customer_id is distinct from p_customer_id then
    raise exception 'Order ownership could not be verified.';
  end if;

  insert into public.order_reviews (
    order_id,
    customer_id,
    customer_email,
    sentiment,
    comment
  )
  values (
    v_order.id,
    p_customer_id,
    lower(trim(p_customer_email)),
    p_sentiment,
    nullif(trim(p_comment), '')
  )
  returning id into v_review_id;

  if p_sentiment = 'POSITIVE' and p_customer_id is not null then
    select
      coalesce(max(p.review_reward_percent), 0),
      coalesce(round(sum(
        case
          when p.review_reward_enabled
            then oi.total_price * p.review_reward_percent / 100
          else 0
        end
      ), 2), 0)
    into v_reward_percent, v_reward_amount
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = v_order.id;

    if v_reward_amount > 0 then
      insert into public.customer_wallets (user_id, balance, currency)
      values (p_customer_id, 0, v_order.currency)
      on conflict (user_id) do nothing;

      select balance
      into v_balance_before
      from public.customer_wallets
      where user_id = p_customer_id
      for update;

      v_balance_after := v_balance_before + v_reward_amount;

      update public.customer_wallets
      set
        balance = v_balance_after,
        updated_at = now()
      where user_id = p_customer_id;

      insert into public.wallet_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        order_id,
        reference_id
      )
      values (
        p_customer_id,
        'CREDIT',
        v_reward_amount,
        v_balance_before,
        v_balance_after,
        'Positive review reward for order ' || v_order.order_number,
        v_order.id,
        'REVIEW:' || v_review_id::text
      )
      returning id into v_transaction_id;

      update public.order_reviews
      set
        reward_percent = v_reward_percent,
        reward_amount = v_reward_amount,
        reward_transaction_id = v_transaction_id,
        updated_at = now()
      where id = v_review_id;
    end if;
  elsif p_sentiment = 'NEGATIVE' then
    insert into public.review_support_cases (
      review_id,
      order_id,
      customer_id,
      customer_email
    )
    values (
      v_review_id,
      v_order.id,
      p_customer_id,
      lower(trim(p_customer_email))
    )
    returning id into v_support_case_id;
  end if;

  return jsonb_build_object(
    'reviewId', v_review_id,
    'rewardAmount', v_reward_amount,
    'rewardPercent', v_reward_percent,
    'supportCaseId', v_support_case_id
  );
exception
  when unique_violation then
    raise exception 'A review has already been submitted for this order.';
end;
$function$;

revoke all on function public.submit_verified_order_review(
  uuid, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_verified_order_review(
  uuid, uuid, text, text, text
) to service_role;

comment on column public.products.review_reward_enabled is
  'When enabled, a signed-in customer receives wallet credit after one verified positive order review.';

comment on column public.products.review_reward_percent is
  'Percentage of the matching delivered line total credited for a verified positive review.';

comment on table public.review_support_cases is
  'Admin-only support cases automatically created from verified negative order reviews.';

commit;
