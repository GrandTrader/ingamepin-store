# Definite Play catalogue integration

## Active catalogue scope
Admin-only catalogue browsing, supplier balances, draft product import with markup/manual USD prices, and explicit links from website product options to supplier SKUs. This stage does not place orders, deliver codes, change existing product prices, or add supplier quantities to owned inventory.

- Admin catalogue: /admin/definiteplay
- Draft importer: /admin/definiteplay/import (one supplier category/region, up to 50 options)
- Product matching: /admin/products/<id>/edit/supplier
- Supplier requests originate from the existing whitelisted VPS.
- Catalogue refresh: every five minutes; manual refresh minimum 30 seconds.
- Data older than 15 minutes cannot be used to create links.
- Failed sync retains the last complete snapshot and displays an error.
- Supplier price currency and gift-card face-value currency remain separate.
- Available balance in another currency is displayed as reported, never relabelled USD or converted using an inferred exchange rate.

## Draft import and pricing
Use Import product on a catalogue row to load every denomination in that SKU’s supplier category, region and product version (previous text-search filters are ignored). All are selected initially; deselect unwanted options before saving one draft. You can also filter to one category/region and choose Import filtered items into one product. Groups larger than 50 require narrower filters, with an explicit single-denomination fallback for row imports. The preview supports selecting an existing website category or creating one inline (name and product type), English/Russian titles/descriptions, option selection, denomination corrections, a cost-based markup (0% by default), and manual USD selling prices. Markup rounding uses integer decimal arithmetic.

The server rechecks the selected supplier SKUs and costs before writing. Changed quotes, stale data, non-USD supplier costs, duplicates and mixed category/region/version groups are rejected. The Product version filter separates regular names from names containing the supplier label Discount or Discounted. This is a label-based distinction, not a calculation from price versus face value. A unique import reference is used as the product ID, so retrying the same form cannot insert a duplicate product.

Imports create DRAFT/MANUAL products with zero owned stock and options marked out of stock. Options are linked to supplier SKUs after creation. If option or mapping persistence fails, the draft is retained and the UI tells the administrator to review it. Re-importing an existing reference does not overwrite it. This intentionally does not simulate atomicity across Supabase and the VPS.

Prices are fixed at import time; later supplier price changes do not automatically reprice products. Edit Product options to change them. A future automatic repricing policy would be a separate feature.

## Configuration
The website uses server-only DEFINITEPLAY_RELAY_URL and DEFINITEPLAY_RELAY_SECRET.
The four supplier credentials are stored in the ignored .env.definiteplay.local for installation/diagnostics, and /etc/ingamepin-definiteplay.env on the VPS (root-readable only). They must never use NEXT_PUBLIC_ names.

Run scripts/definiteplay-install-bridge.cjs with Node to install/update only the bridge. It generates/reuses a relay secret in the ignored local .env.local, transfers secrets over SSH stdin, and installs a dedicated systemd service. It adds the /definiteplay/* route to the existing relay host, validates Caddy configuration, and retains a configuration backup.

Before a future website deployment, provision the two website relay environment variables privately in the hosting environment. Do not publish the supplier credentials there.

## State and recovery
Service: ingamepin-definiteplay.service
Code: /opt/ingamepin-definiteplay/server.py
State: /var/lib/ingamepin-definiteplay/catalogue.db
Mappings persist independently of the website database. Include this database in VPS backups, using SQLite's online backup API or stopping only this supplier service during the copy. A deleted website option may leave an unused mapping; any future order flow must verify that the option still exists.

The relay has no purchasing endpoint; its upstream allowlist contains only session.php, balances.php and fetchstocklist_v2.php. Requests require a private bearer secret. Website actions separately verify admin membership/MFA and option ownership.

## Validation
- Python: python -m unittest discover -s vps-definiteplay -p "test_*.py"
- Node: node --test scripts/tests/definiteplay-money.cjs scripts/tests/definiteplay-admin.cjs scripts/tests/definiteplay-import.cjs
- Live diagnostics: scripts/definiteplay-check.cjs is read-only. Avoid running it concurrently with a service sync to respect the supplier's shared request limit.


## Supplier delivery implementation (worker connected; products not activated)

Migration: supabase/migrations/20260925_150000_definiteplay_fulfillment.sql.
The website and bridge default to automatic purchasing OFF. On 25 September 2026,
the user applied the migration and its tables/column were verified on the hosted database.
The VPS worker was connected successfully, with zero jobs and no products enabled.
The live website deployment and website feature flag remain pending. Do not enable
published products until the website checkout and fulfillment changes are deployed.

The Supplier tab can enable a dedicated DEFINITEPLAY stock source after all active
options are linked. Availability comes from supplier USD costs and explicitly
reported USD Available Balance. Unknown stock quantity is capped at one; known
stock is capped at 1,000 and the current buying balance. Price changes do not change
customer selling prices. Stale data (15 minutes), missing products or a missing USD
balance result in zero availability. Other buyers may consume supplier stock before
a paid order is processed; stock is not a supplier reservation.

The paid-order worker in vps-definiteplay/fulfillment.py:
- Claims only paid orders with a VERIFIED USD payment covering the order total.
- Snapshots the SKU, quantity and maximum supplier cost at checkout.
- Checks fresh supplier stock, cost and USD buying balance before submission.
- Writes a durable submission marker before the supplier POST.
- Uses one immutable supplier reference per order item.
- Never automatically submits again after a timeout, duplicate or uncertain result.
  It fetches the existing reference at intervals of at least 60 seconds.
- Validates the returned reference, SKU, quantity, currency, amount and code count.
- Stores codes through the existing protected gift_card_codes delivery system,
  including PIN/serial details, and completes the order only when every item is done.
  Codes are visible through the existing customer order page; this stage does not
  add a separate automatic delivery-email notification.
- Holds mismatches and unresolved orders for administrator review. Refunds and
  cancellations are blocked while a submitted purchase remains unresolved.
- Does not persist code payloads on the VPS or expose a public purchase endpoint.

The supplier API has no maximum-price field. A price change between the preflight
and submission may still charge a different amount; that response is held for review.
The existing website code store is reused; this change does not add separate
application-level encryption to that store.

Activation sequence for the maintainer:
1. Apply the migration using database administrator access. Do not expose database
   credentials in chat. The website's service API key cannot apply SQL migrations.
2. Deploy the complete website changes while DEFINITEPLAY_FULFILLMENT_ENABLED is
   unset/false. The legacy stock flow remains available.
3. Deploy server.py and fulfillment.py together. The catalogue installer is
   staging-only and refuses to overwrite a bridge with fulfillment configuration.
4. Privately configure the VPS with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
   and DEFINITEPLAY_FULFILLMENT_ENABLED=true; restart only ingamepin-definiteplay.
   Configure DEFINITEPLAY_FULFILLMENT_ENABLED=true on the website too.
   Never give the website the supplier's four API credentials.
5. Confirm worker readiness and a fresh catalogue, then enable individual products
   from their Supplier tab. Enabling does not publish a draft product.
   Review denomination/region links, selling prices and product visibility.

Do not switch the global website flag off while enabled supplier products or jobs
remain. To stop new orders, make affected products inactive. Keep reconciliation
running for already submitted orders. Jobs in REVIEW require investigation using
the displayed supplier reference. Never reset submitted_at or generate a new
reference to retry an uncertain purchase. Pre-submission failures can be cancelled
and refunded using the normal order tools; submitted failures must first be reconciled
with the supplier. This stage intentionally has no automatic refund or reorder button.

Validation added:
- python -m unittest discover -s vps-definiteplay -p "test*.py"
- node --test scripts/tests/definiteplay-fulfillment.cjs
- node scripts/tests/definiteplay-fulfillment-db.cjs
  (PGLITE_PATH may point to an isolated installation of @electric-sql/pglite.)
