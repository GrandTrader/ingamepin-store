# Verified business customer portal

Local testing only. No deployment or database changes are required for this addition; the existing business KYB migration must already be installed.

## Access and classification

The signed-in customer must have a verified email and an APPROVED business_kyb application. Other customers are sent to Business verification. Approved customers opening the existing dashboard are sent to /account/portal. Auth and approval are checked independently by every page and export route.

Both tiers use the portal. Current calendar-month net paid USD merchandise purchases of at least $5,000 show Reseller; lower totals show Retailer. The calendar uses Asia/Kolkata. Qualification uses paid_at, subtotal minus discounts, and deducts non-cancelled item refunds (including issued refunds awaiting claim), floored at zero per order. Only PAID, PROCESSING and DELIVERED orders count. Wallet deposits, gateway fees, unpaid, cancelled, fully refunded and non-USD orders do not count. There is no automatic price discount associated with the label; existing administrator-assigned customer discounts are reused. The declared activity on the KYB application remains separate from the calculated tier.

## Screens

- /account/portal: grouped order history, old/current order number search, date/status filters, full filtered CSV export, existing invoices and delivered CSV/TXT code downloads.
- /account/portal/statement: actual wallet transactions with saved balance-after values, date/type filters and full filtered CSV export. Non-wallet orders are in order history.
- /account/portal/new: current catalogue with region/brand controls, popular sort, quantities and stock checks. Required delivery details, custom values and game-top-up choices use the existing product form.

Drafts are stored by user ID in browser local storage. The draft does not reserve stock or debit money. Review in cart preserves existing cart items, rechecks total stock and clears the transferred draft. Existing checkout performs authoritative pricing, restrictions, KYB and payment checks. Current stock is refreshed when a catalogue page opens and checked again before transfer to the cart.

CSV exports are private uncached attachments with spreadsheet-formula escaping. Code exports validate order ownership and item membership before loading SOLD codes. CSV is compatible with Excel; it is not an XLS workbook.

## Validation

- node --test scripts/tests/business-portal.cjs
- node scripts/tests/business-portal-ui.cjs (isolated sample-data browser test; uses the configured Codex runtime Playwright and installed Chrome on this Windows machine)
- Scoped ESLint and Next.js webpack production build in the isolated release checkout.
- Read-only checks of the configured Supabase schema and anonymous localhost access redirects.

No real KYB approval, order, payment or wallet credit is created by these tests. Localhost currently uses the configured Supabase database, so approvals and wallet credits made manually are real database writes.

All storefront B2B links lead to the protected business portal. The legacy /products/bulk route verifies approval before redirecting to the portal catalogue. Bulk-product detail pages require the same approval, including their canonical category URLs. Private bulk pages are excluded from the public sitemap. An email-verified login alone is not sufficient: admin-approved business KYB is required.

## Per-customer Direct Bank Transfer

Apply `supabase/migrations/20261011_160000_business_bank_customer_access.sql` before deploying this feature. Admin → B2B accounts & API requests → customer Details has an immediately saved Direct Bank Transfer switch. Existing eligibility is preserved (ON by default); approved KYB, enabled wallet and the global bank setting are still required.

OFF blocks new bank invoices and deposit submissions, including stale forms and legacy invoice/deposit database functions. Historical invoices/deposits remain visible and admins can review already-submitted deposits. Customers who sent money before being disabled should contact support. This controls bank transfers into the wallet, not a new direct-order checkout method. Changes are admin-only, revision-checked and recorded in the business audit history; changing the switch never credits a wallet.

Run `npm run test:business-bank` for action/access checks and isolated PostgreSQL migration tests. Run `node scripts/tests/business-bank-switch-ui.cjs` after a production build for desktop/mobile switch interactions using fake customers and actions only.


## B2B Product Catalog discounts

Admin → Catalog → B2B Product Catalog searches all website products and manages business channel availability and B2B discount percentages. The catalog shows 20 products per page and supports product name, category, region, publication status and B2B availability filters. Pagination preserves every filter and the selected customer. Bulk activation/deactivation changes only the selected products’ business channel flag; retail flags and global publication status stay unchanged. Draft and suspended products still need publishing in Products, and pre-orders are shown but cannot be enabled for B2B. These availability controls work even before the discount migration is installed. Missing discount setup never hides the product list; only discount editing is disabled. General discounts apply to all B2B customers. Loading a registered email selects that account; saving changes only the selected products, leaving its other assignments intact. Assignment uses the registered user ID, with an exact case-insensitive email lookup. No account is created by this tool.

Discounts apply across denominations and custom ranges. The largest of the public promotion, existing personal discount, general B2B percentage, and selected customer's B2B percentage is used; they never stack. Setting 0 clears that rule, allowing other rules to apply. Seller-managed prices are excluded. Retail prices and existing retail customer-discount controls are unchanged. Authenticated B2B catalog, business API quotes, and wallet checkout use the same database resolution. Existing paid orders retain their price on retries.

Apply `supabase/migrations/20261011_170000_business_catalog_discounts.sql` before deploying the app changes. The migration creates separate service-only B2B tables and updates only the two discount lookups in the existing portal checkout function. It creates no discounts, orders, or wallet movements. Batch saves check the administrator, registered customer, product eligibility and revisions, rolling back the whole batch if any row is stale.

Validation: `npm run test:business-discounts` runs isolated admin/read tests and real database checkout tests (including retail isolation, ranges, fixed denominations, non-stacking, stale quotes, replay, permissions, and atomic batch edits). `node scripts/tests/business-catalog-discounts-ui.cjs` exercises the actual editor against fake actions at desktop and phone sizes; it changes no customer data.
