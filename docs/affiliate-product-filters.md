# Affiliate product filters and bulk save

Affiliate Settings supports filtering products by name, category, region, product status, and affiliate status. Bulk commission and enable/disable controls apply to the displayed products as drafts. Save changes writes only those displayed IDs in one atomic transaction. Hidden products, earnings, and payout history remain unchanged.

Apply `supabase/migrations/20261003_110000_bulk_affiliate_product_settings.sql` before deploying the editor. This migration only installs the bulk-save function and its service-role permissions; it does not reset or change existing rates. The administrator server action checks access and validates every submitted product setting.

This release contains the product settings editor only. Commission calculation changes are separate.

Checks: `scripts/tests/affiliate-product-settings.cjs`, `scripts/tests/affiliate-product-settings-db.cjs` (requires `PGLITE_PATH`), and `scripts/tests/affiliate-product-settings-ui.cjs`.
