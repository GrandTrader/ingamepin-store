# GiftPort supplier workflow

## Admin catalogue and imports

`/admin/giftport` shows the INR supplier wallet balance, searchable catalogue, category/country/delivery filters and 30-brand pages. API configuration is collapsed after a successful connection. Each brand has an Import brand action; the import screen supports a website category (including creating one), English/Russian titles and descriptions, selecting up to 50 denominations, adding fixed options within an explicitly confirmed variable range, and entering USD selling prices.

GiftPort has no wholesale-cost field. Selling prices can be entered manually or filled using the website exchange rate plus a percentage markup. The calculator divides face value by local-currency units per USD, adds markup, then rounds the final USD price to two decimals. Each Apply reads the current saved storefront rate from Payment Settings; missing or invalid rates block calculation rather than guessing. Only selected options are replaced, and all prices remain editable. This is markup on face value, not verified profit margin or wholesale cost. Imported prices remain fixed when exchange rates later change. GiftPort imports currently support confirmed INR brands; the shared calculator supports USD, INR and RUB where website rates exist. Website denomination columns are integers, so fractional face values are not silently rounded.

An import creates a DRAFT/MANUAL product with OWNED stock source, zero stock, options marked out of stock, and one batch of saved GiftPort links. It does not publish products, buy gift cards or activate delivery. The import UUID remains the import reference across retries; a repeated reference returns the existing draft rather than creating duplicates. If options or links fail, the draft is retained with a warning and a review link.

## Product links

The product Supplier tab has Definite Play and GiftPort views. Imported GiftPort slugs default to the GiftPort view; other products can select it. Search selects a supplier brand for each option. The server checks admin/MFA access, product ownership of the option, OWNED stock source, current catalogue freshness, matching INR currency and a confirmed fixed value or valid variable range. The bridge validates the same supplier values before committing the full batch.

Links are stored in `/var/lib/ingamepin-giftport/links.db` with option ID uniqueness and product ID ownership checks. They can be reviewed and removed. An option changed after linking is flagged for review; links do not change selling prices or stock. An active Definite Play product must be switched to uploaded stock before editing GiftPort links. Active GiftPort links are also locked. Delivery uses the existing protected supplier queue with separate provider claims; Definite Play workers cannot claim GiftPort orders.

## Configuration and refresh

Whitelist server IP `187.127.167.138` in GiftPort API Settings. The onboarding callback is `https://pally-relay.ingamepin.com/giftport/callback`. Finish GiftPort OTP verification, then enter Client ID and Secret ID in the website's GiftPort admin page.

Supplier calls use POST JSON from the VPS only. Credentials never appear in URLs, browser responses or application logs. Successful authenticated catalogue and balance responses save credentials in a mode-0600 file inside the private systemd state directory. Failed API access preserves the previous connection. Unreadable individual amounts generate notices and do not turn an unknown balance into zero.

The bridge refreshes every five minutes after startup and supports manual refresh (minimum 30 seconds between attempts). Snapshots older than 15 minutes prevent importing and saving links. The browser displays the latest snapshot when loaded or refreshed.

By default the website uses the existing `DEFINITEPLAY_RELAY_URL` host with path `/giftport` and the existing private `DEFINITEPLAY_RELAY_SECRET`. Optional server-only `GIFTPORT_RELAY_URL` and `GIFTPORT_RELAY_SECRET` override those. This shares only the private gateway credential, not supplier API keys; coordinate gateway-key rotation accordingly.

## Verified live data and parsing

On 27 September 2026, the authenticated catalogue returned 384 India/INR brands: 230 fixed-only and 154 variable-value brands. The actual fields are `variable_denomination`, `variable_denomination_range`, `currency_code`, `country`, `category`, and `delivery_type`; the documented `variable` flag remains a fallback. All 154 variable ranges were positive and ordered. The live INR wallet balance was readable.

Amounts accept exact two-decimal values including trailing decimal zeros and explicit INR/Rs/rupee prefixes and valid Indian/international grouping. They are never silently rounded. Commas separate values in catalogue strings, per the supplied documentation. If any fixed-list entry is invalid, the whole list is withheld rather than partially converting malformed grouping into invented values. GP103 supplies `2,00,01,000`; GP281 supplies a brand name instead of denominations. These two fixed lists remain flagged. Explicit validated variable ranges may still be used.

Unknown variable flags are null, not false. Unconfirmed ranges never authorize a variable value. Missing/unreadable balances are null and shown as Unavailable.

## Purchasing and callback boundary

Automatic delivery is implemented behind `GIFTPORT_FULFILLMENT_ENABLED=true` on the VPS. Applying SQL, importing a product or saving links does not activate purchases. The HTTP bridge exposes no buy operation; its public callback only acknowledges bounded payloads, never authorizes delivery or credit.

The admin saves a business recipient name, email and mobile in the GiftPort Supplier view. Customer details are not sent to GiftPort. These business details and the fixed INR value are snapshotted at checkout, so later edits do not change pending orders. The admin links all active denominations, supplies a conservative USD cost budget per 100 INR (including fees/conversion), and sets a 1–100 card purchase limit before enabling a product. Missing schema, recipient, fresh catalogue or worker heartbeat blocks activation. Imported drafts remain inactive until separately published. Variable/range purchases continue through the existing manual workflow.

GiftPort's supplied `/buy` and `/status` contract has no wholesale-cost, fee, quantity or stock fields. Each card therefore has its own immutable `IGPGP…_n` order reference and durable submission marker. The shared `definiteplay_jobs`/`definiteplay_stock` tables retain their existing names internally and now support a `GIFTPORT` provider. The private `giftport_cards` table tracks each purchase and verified delivery. The worker sends POST JSON and verifies `/status` even after an immediately successful buy, matching the exact order reference, INR amount, mobile and business email and requiring a transaction ID and redeem code. Optional card numbers are preserved including leading zeros. Codes are published through the existing protected completion function after every card in the line is verified; the order completes only after all its items are delivered.

Availability is a purchase allowance based on current catalogue membership, the supplier INR wallet and the administrator's cap; it is not a confirmed supplier stock count. The worker rechecks the denomination and wallet before each purchase. Unknown balances/currencies fail closed. The cost budget is checked against net selling price after discounts by the existing queue, but is an **estimate, not an invoiced wholesale cost** (`cost_is_estimate=true`); GiftPort cannot currently provide a verifiable fee/cost quote. Supplier invoices must be reconciled separately.

Verified payment, order state, leases and refund checks precede submission. A purchase marker is committed before calling `/buy`; a marker timeout never proceeds to buy. Any submitted/ambiguous card is checked via `/status` only and is never automatically purchased again, even if GiftPort reports it missing. Unresolved status checks go to REVIEW after one hour; explicit failures/mismatches go straight to REVIEW. Do not reset a submitted reference or mark REJECTED without confirming with GiftPort that no charge/delivery occurred. Refund/cancel guards remain in force during ambiguous purchases. Duplicate transaction IDs and redeem codes are rejected. Codes, credentials and recipient payloads are never logged. Changing supplier credentials is blocked while the worker is enabled; reconcile pending orders before any account change.

## Activation requirements

1. Apply `supabase/migrations/20261006_120000_giftport_fulfillment.sql` after the existing Definite Play and range migrations. No products are activated by the migration.
2. Install the updated bridge/worker using the deployment script. The service's private `/etc/ingamepin-giftport.env` needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` as well as its existing relay secret. Transfer these server credentials securely; never paste them into customer-facing forms or logs. Add `GIFTPORT_FULFILLMENT_ENABLED=true` only when the schema is installed, then restart the service and verify `fulfillmentReady`.
3. Deploy the website, save the business recipient in the Supplier tab, confirm each product's links/budget/purchase limit and enable it. Existing OWNED products are not changed automatically.

No live purchase has been made during implementation. A separately authorized small purchase is still required to verify GiftPort's real response and delivery behavior end to end. The local test suite uses simulated supplier responses and an isolated PostgreSQL database.

## Deployment and tests

`node scripts/giftport-install-bridge.cjs` installs the dedicated VPS service and additive Caddy route, preserves credentials and link state, backs up replaced code/routing and checks readiness. Website changes deploy through the approved production release branch.

- `python -m unittest discover -s vps-giftport -p 'test_*.py'`
- `node --test scripts/tests/giftport-import.cjs scripts/tests/giftport-fulfillment-actions.cjs scripts/tests/supplier-price-calculator.cjs`
- `node scripts/tests/giftport-fulfillment-db.cjs`
- TypeScript, targeted ESLint and production Next build.

Tests cover auth boundaries, credential replacement failure, safe callback handling, blocked purchases, live-format amount parsing, range validation, stale links, atomic batches, cross-product ownership, import pricing and denomination currency, duplicate retries and partial database/link failures. Tests use fake supplier responses and never purchase cards.

The worker tests additionally cover successful status verification, mismatched recipients/amounts, uncertain submissions, marker timeouts, missing codes, distinct references for multi-card lines and sanitised failure messages. PostgreSQL tests cover provider isolation, recipient snapshots, verified-payment-only claims, exclusive leases, sequential per-card markers, duplicate transactions/codes, refund/mode guards and idempotent final delivery.
