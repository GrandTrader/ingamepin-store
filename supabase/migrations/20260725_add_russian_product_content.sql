alter table public.products
add column if not exists name_ru text,
add column if not exists description_ru text,
add column if not exists badge_ru text;
