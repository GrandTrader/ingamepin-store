# GiftPort: connection stage

The admin page at `/admin/giftport` connects to a dedicated VPS bridge. All supplier calls originate from `187.127.167.138`. It can validate/save API keys, fetch the catalogue and INR balance, and refresh those values. It has no purchase endpoint, product imports or automatic delivery yet.

## Configuration

In GiftPort API Settings whitelist `187.127.167.138` and set the callback URL to `https://pally-relay.ingamepin.com/giftport/callback`. Finish GiftPort's OTP verification. Enter Client ID and Secret ID in the website's GiftPort admin page. Both are sent via authenticated server actions and a private HTTPS relay; they are never returned to the browser or put in URLs.

Keys are validated using POST catalogue and balance requests before being saved. The service stores them with mode 0600 in its private systemd state directory `/var/lib/ingamepin-giftport`; root and the service user can read them. Failed replacement credentials preserve the previous connection. Snapshot data is refreshed manually, with a 30-second minimum interval; snapshots older than 15 minutes are labelled stale.

The website defaults to the existing `DEFINITEPLAY_RELAY_URL` host and `DEFINITEPLAY_RELAY_SECRET` private gateway credential. Optional server-only `GIFTPORT_RELAY_URL` and `GIFTPORT_RELAY_SECRET` override these. This shares the private relay credential, not either supplier's API credentials. Coordinated rotation is required when using the shared default.

## Callback boundary

The public callback is an onboarding receiver: GET reports readiness; POST acknowledges bounded payloads without retaining them, changing orders, or contacting the supplier. It is **not a working fulfillment webhook**. The supplied API documentation gives no callback authentication or schema. Do not enable purchasing until order-status reconciliation is implemented; an untrusted callback must never authorize delivery or wallet credit.

## Further purchasing integration

Obtain live catalogue/access first. Confirm supplier wholesale cost/discounts, denomination currencies, allowed variable-value ranges, pending/error semantics, recipient handling and the callback contract. The supplied catalogue lists no stock or wholesale prices. Face value is not purchase cost. Website prices are USD; do not silently treat INR as USD.

Before enabling purchasing, implement explicit product/denomination mappings, paid-order validation, durable unique order IDs and submission markers, ambiguous-result reconciliation through `/status` without resubmitting `/buy`, and protected code delivery with exact order/amount/recipient checks. Do not test with a paid purchase without an explicitly chosen product and budget.

## Deployment and checks

`node scripts/giftport-install-bridge.cjs` installs only the dedicated service and additive Caddy route, validates routing, and checks service readiness. Existing supplier services and their credentials are untouched. The installer preserves saved GiftPort credentials and backs up replaced code and Caddy configuration.

`python -m unittest discover -s vps-giftport -p 'test_*.py'` checks authentication, untrusted callback isolation, credential replacement failure, request limits, POST-only secrets, redirect refusal, data validation, and blocked purchasing. No test calls the real supplier.

Variable-denomination flags accept case/whitespace variations of Yes/No, true/false, 1/0 and variable/fixed, plus JSON booleans and integer 1/0. Missing or unrecognised flags are represented as null and displayed as "Not confirmed"; they do not prevent catalogue loading or imply permission to purchase arbitrary amounts.

Amount compatibility: exact two-decimal values with trailing decimal zeros, whitespace, INR/Rs/₹ prefixes and valid Indian/international grouping are normalized without rounding. Catalogue strings use comma-separated values; arrays and individual numeric denominations are also accepted. A fixed-value list containing zero, ranges or unreadable values is withheld in full with an explicit incomplete-values notice; partial parsing must not invent values from malformed grouping. An unreadable balance or unconfirmed INR currency is stored as null and shown as Unavailable, never zero. Successful authenticated catalogue/balance responses can save credentials even when individual amounts are unconfirmed; supplier request failures still preserve the existing connection. Future purchasing must reject null balances and unconfirmed denominations until independently validated.

Live API verification (27 September 2026): authenticated catalogue returned 384 India/INR brands, using `variable_denomination` (230 No, 154 Yes), `variable_denomination_range`, and `currency_code`. The bridge prefers these observed flag fields with a fallback to the documented `variable` field. It validates positive ordered numeric ranges, displaying them only when variable denominations are explicitly enabled. The authenticated balance response is INR and readable. GP103 has malformed fixed denominations (`2,00,01,000`); GP281 has a brand-name string instead of denominations. Their fixed values are withheld, not guessed. Wholesale costs remain absent.
