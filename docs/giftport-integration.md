# GiftPort supplier workflow

## Admin catalogue and imports

`/admin/giftport` shows the INR supplier wallet balance, searchable catalogue, category/country/delivery filters and 30-brand pages. API configuration is collapsed after a successful connection. Each brand has an Import brand action; the import screen supports a website category (including creating one), English/Russian titles and descriptions, selecting up to 50 denominations, adding fixed options within an explicitly confirmed variable range, and entering USD selling prices.

GiftPort has no wholesale-cost field. Selling prices can be entered manually or filled using the website exchange rate plus a percentage markup. The calculator divides face value by local-currency units per USD, adds markup, then rounds the final USD price to two decimals. Each Apply reads the current saved storefront rate from Payment Settings; missing or invalid rates block calculation rather than guessing. Only selected options are replaced, and all prices remain editable. This is markup on face value, not verified profit margin or wholesale cost. Imported prices remain fixed when exchange rates later change. GiftPort imports currently support confirmed INR brands; the shared calculator supports USD, INR and RUB where website rates exist. Website denomination columns are integers, so fractional face values are not silently rounded.

An import creates a DRAFT/MANUAL product with OWNED stock source, zero stock, options marked out of stock, and one batch of saved GiftPort links. It does not publish products, buy gift cards or activate delivery. The import UUID remains the import reference across retries; a repeated reference returns the existing draft rather than creating duplicates. If options or links fail, the draft is retained with a warning and a review link.

## Product links

The product Supplier tab has Definite Play and GiftPort views. Imported GiftPort slugs default to the GiftPort view; other products can select it. Search selects a supplier brand for each option. The server checks admin/MFA access, product ownership of the option, OWNED stock source, current catalogue freshness, matching INR currency and a confirmed fixed value or valid variable range. The bridge validates the same supplier values before committing the full batch.

Links are stored in `/var/lib/ingamepin-giftport/links.db` with option ID uniqueness and product ID ownership checks. They can be reviewed and removed. An option changed after linking is flagged for review; links do not change selling prices or stock. An active Definite Play product must be switched to uploaded stock before editing GiftPort links. No existing Definite Play purchasing logic is modified.

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

Automatic GiftPort purchasing, stock availability and delivery are NOT implemented or enabled. There is no buy endpoint in the bridge. The public callback only acknowledges bounded payloads without retaining them, changing orders or contacting GiftPort. It is not a fulfillment webhook.

Before activation, confirm wholesale costs/fees and recipient handling, then implement verified paid-order jobs, durable unique supplier order references, submission markers, ambiguous-result reconciliation via `/status` without resubmitting `/buy`, protected code delivery and exact order/amount/recipient validation. Callback contents alone must never authorize delivery or wallet credit. No paid test purchase was made.

## Deployment and tests

`node scripts/giftport-install-bridge.cjs` installs the dedicated VPS service and additive Caddy route, preserves credentials and link state, backs up replaced code/routing and checks readiness. Website changes deploy through the approved production release branch.

- `python -m unittest discover -s vps-giftport -p 'test_*.py'`
- `node --test scripts/tests/giftport-import.cjs scripts/tests/supplier-price-calculator.cjs`
- Targeted ESLint and production Next build.

Tests cover auth boundaries, credential replacement failure, safe callback handling, blocked purchases, live-format amount parsing, range validation, stale links, atomic batches, cross-product ownership, import pricing and denomination currency, duplicate retries and partial database/link failures. Tests use fake supplier responses and never purchase cards.
