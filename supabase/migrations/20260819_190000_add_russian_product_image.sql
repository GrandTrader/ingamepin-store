alter table public.products
add column if not exists image_url_ru text;

comment on column public.products.image_url_ru is
  'Optional product image shown when the storefront language is Russian.';
