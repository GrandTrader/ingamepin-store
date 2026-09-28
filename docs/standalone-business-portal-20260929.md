# Standalone retail and business portals — 2026-09-29

## Scope
- `/account/portal` has its own neutral/purple header, navigation, settings and footer. Retail header, category navigation, decorations, retail cart and storefront footer stay outside it.
- Both interfaces have a switch. Business routes retain approved-KYB access checks.
- Retail history and counts use RETAIL orders. Business history, monthly tier spend and code exports use BUSINESS orders. Owned old receipt/invoice links redirect to the appropriate interface; ownership checks run before redirects.
- Both portals use the existing customer wallet. The statement remains a complete shared-wallet ledger. No balances are copied or reset.
- Profile, security, business verification, wallet top-up and receipt pages have portal routes. Payment success/failure returns remember the originating portal when the gateway provides its payment reference. B2B checkout remains wallet-only.
- Settings use existing account features. Staff invitations/roles and new API/redemption tools from the reference screenshots are not part of this change.
- Persistent business frame retains enough height to preserve current scroll on short-page navigation.

## Database stage
Run `supabase/migrations/20260929_001000_order_sales_channels.sql` before testing the updated application against the shared database. It adds orders.sales_channel, backfills portal/API/B2B-numbered orders, stamps new orders from trusted checkout context, and stores the wallet top-up return preference. It never modifies wallet balances or amounts. Existing product channel and portal wallet migrations are prerequisites.

## Verification
- 14 business portal tests: KYB, ownership, retail/business query separation, shared statement, receipt/invoice routing, gateway returns.
- PGlite portal checkout integration: quotes/confirmations, channels, repeat migration/backfill, unchanged balances, replay, stock and wallet rollback.
- Browser fixture at 1440px and 390px: separate shell, switches, persistent layout, no sideways/upward jump, Back, filters.
- Browser fixture: responsive settings, instant catalogue filters, range quantities, wallet-only confirmation, retained retail cart.
- Focused ESLint and production Webpack build passed in the release checkout.

Local work only. No deployment or live purchase. Authenticated live-data validation remains pending the SQL stage.
