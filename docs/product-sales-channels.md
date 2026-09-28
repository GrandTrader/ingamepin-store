# Product sales channels — local, pending SQL

Admin Products now has category, region, and Bulk/Retail type filters plus independent Business portal and Retail site switches. Type filtering uses the existing is_bulk_order setting; channel switches control where each product can be offered, independently of type. Products must also be Active to be offered.

Apply supabase/migrations/20260928_230000_product_sales_channels.sql before activation. Both flags default true. This migration depends on the installed portal_wallet_checkout function from 20260928_223000. It adds a transaction-scoped BUSINESS setting around order creation in that service-only function and a new-order-item guard, including bulk API checks. Existing orders, payment continuation and idempotent replay remain available. No new payment is sent in tests.

Retail catalogue, search, product URLs, header discovery, affiliate catalogue and sitemap filter retail_enabled. B2B catalogue, region discovery and bulk API filter business_enabled. Checkout validates the trusted request path plus the database guard; customer-supplied channel fields are ignored. Switch actions require admin assurance and membership and invalidate both catalogue caches.

Validation: database channel matrix/rollback/replay tests; action authorization, independent field updates and filter tests; actual admin page rendered with fixture data in Chrome, combined filters, pagination, reset, empty results, switch failure rollback and mobile overflow. Scoped ESLint passed. Isolated release production compilation and TypeScript passed; prerender of sitemap.xml waits for the new database columns. Main-tree tsc also reports pre-existing cached page-export types and an obsolete nowpayments artifact; unrelated files were not changed. Nothing pushed or deployed.

Permission fix: function-level SET of a custom parameter fails for a non-superuser (42501). The migration now patches the installed function with runtime set_config and explicit restoration, guarded by version markers. Restricted-role installation and repeated execution are tested.

Tests: scripts/tests/admin-product-channels.cjs, scripts/tests/admin-product-channels-ui.cjs, scripts/tests/portal-wallet-db.cjs, scripts/tests/portal-checkout-api.cjs. UI fixture CSS is read from the isolated release build by default; CHANNEL_CSS_DIR overrides it. PGLITE_PATH may be needed for database tests.
