alter table public.products
add column if not exists is_preorder_only boolean not null default false;

alter table public.preorder_popup_settings
add column if not exists description text not null default '';

alter table public.preorder_popup_settings
add column if not exists ultimate_price numeric(12,2);

alter table public.preorder_popup_settings
drop constraint if exists preorder_popup_settings_ultimate_price_check;

alter table public.preorder_popup_settings
add constraint preorder_popup_settings_ultimate_price_check
check (ultimate_price is null or ultimate_price >= 0);

update public.preorder_popup_settings
set
  is_enabled = false,
  product_id = null
where id = true;

create index if not exists products_preorder_only_idx
on public.products(is_preorder_only);
