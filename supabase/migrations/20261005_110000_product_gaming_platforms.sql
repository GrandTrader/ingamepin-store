-- Optional platform labels for Games products; existing products stay unchanged.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gaming_platforms text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.products.gaming_platforms IS
  'Admin-selected gaming platforms displayed beside the category and on the product cover.';

NOTIFY pgrst, 'reload schema';
