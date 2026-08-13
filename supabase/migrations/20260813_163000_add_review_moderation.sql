alter table public.order_reviews
  add column if not exists is_visible boolean not null default true,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderation_reason text;

alter table public.order_reviews
  drop constraint if exists order_reviews_moderation_reason_length;

alter table public.order_reviews
  add constraint order_reviews_moderation_reason_length
  check (
    moderation_reason is null
    or char_length(moderation_reason) between 3 and 500
  );

create index if not exists order_reviews_visibility_created_idx
  on public.order_reviews (is_visible, created_at desc);
