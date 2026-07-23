update public.products
set sold_count = floor(random() * 701 + 300)::integer;

alter table public.products
alter column sold_count
set default floor(random() * 701 + 300)::integer;
