# Product range denominations

## Release — 7 October 2026

This release connects the production website to Definite Play custom-value delivery. The supplier worker and migrations 20261007_220000, 20261007_230000 and 20261007_240000 are already installed and verified. The worker reports both fixed and range delivery ready, with 36 fresh catalogue entries synchronized to Supabase.

The website release includes the existing-product range importer, percentage pricing, retail and business API checkout readiness checks, and the signed supplier database backup allowlist. Deploying this release does not enable or alter individual product settings. Apple USA (324000US, USD 2–500 in 0.01 increments) retains its saved 11.42% markup and disabled range setting. No test purchases were made.

## Configuration

In Product options, select **Import from Definite Play**, choose the matching product and region, set **Markup on supplier cost (%)**, review the example, then enable and save when ready. Import fills the editor and defaults to disabled; it does not save automatically. Fixed denominations retain their existing settings.

Price = face value × (1 − supplier discount / 100) × (1 + markup / 100), rounded up to cents only for the final card price. A USD 100 card at 2% supplier discount and 5% markup sells for USD 102.90. Customer discounts apply separately. Supplier refreshes retain the chosen markup; existing orders and supplier budgets never change.

The server ignores submitted supplier costs and calculated prices, re-fetches the private catalogue and independently validates the configuration in the database. Supplier cost and markup remain private. Public range data contains the selling rate and rounding rule only: UP for percentage pricing, NEAREST for legacy/manual pricing.

Automatic activation and percentage pricing currently support USD face-value products only. EUR/GBP/CAD require verified supplier billing conversion before activation; no exchange rate is guessed. Legacy manual ranges retain their existing controls and payment-gated manual delivery.

## Delivery safeguards

Checkout requires an available supplier range, fresh catalogue and recent successful range worker heartbeat. The order snapshots the exact supplier SKU, denomination, currency and maximum cost. Only paid orders enter the purchasing queue. Supplier requests use cardvalue and currency with the existing write-ahead submission marker, 90-second timeout and fetch-only recovery. Uncertain purchases are held for review without repeat purchasing.

Range failures are isolated from fixed delivery. A supplier database backup connection can forward only explicitly allowlisted operations with a valid HMAC signature. Migration 20261007_240000 repairs the catalogue sync UPDATE with WHERE available=true for the database safe-update rule.

Protected worker rollback backup: /root/ingamepin-range-upgrade-1791390204344228360.

## Validation

Isolated PostgreSQL tests cover repeat migrations, safe-update repair, exact price calculations, bounds and increments, private percentage persistence, changing supplier costs, immutable paid orders, payment gating, permissions and duplicate-purchase protection. Browser checks cover desktop/mobile import, compact markup editing, manual range purchases and cart payloads. Server-action and checkout tests cover authentication, forged pricing, unavailable workers and foreign-currency activation restrictions. No live purchases are used for validation.
