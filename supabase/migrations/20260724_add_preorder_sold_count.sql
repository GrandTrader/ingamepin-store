alter table public.preorder_popup_settings
add column if not exists sold_count integer not null default 0
check (sold_count >= 0);

update public.preorder_popup_settings
set sold_count = 279
where id = true;
