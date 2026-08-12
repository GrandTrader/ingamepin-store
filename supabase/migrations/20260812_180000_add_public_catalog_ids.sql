begin;

create sequence if not exists public.category_public_id_seq
  as bigint
  start with 584976946
  increment by 1
  minvalue 100000000
  maxvalue 999999999
  no cycle;

create sequence if not exists public.product_public_id_seq
  as bigint
  start with 874868346
  increment by 1
  minvalue 100000000
  maxvalue 999999999
  no cycle;

alter table public.categories
  add column if not exists public_id bigint;

alter table public.products
  add column if not exists public_id bigint;

alter table public.categories
  alter column public_id
  set default nextval('public.category_public_id_seq');

alter table public.products
  alter column public_id
  set default nextval('public.product_public_id_seq');

update public.categories
set public_id = nextval('public.category_public_id_seq')
where public_id is null;

update public.products
set public_id = nextval('public.product_public_id_seq')
where public_id is null;

alter table public.categories
  alter column public_id set not null;

alter table public.products
  alter column public_id set not null;

create unique index if not exists categories_public_id_key
  on public.categories (public_id);

create unique index if not exists products_public_id_key
  on public.products (public_id);

grant usage, select on sequence public.category_public_id_seq
  to authenticated, service_role;

grant usage, select on sequence public.product_public_id_seq
  to authenticated, service_role;

commit;
