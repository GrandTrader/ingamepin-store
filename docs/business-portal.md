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
