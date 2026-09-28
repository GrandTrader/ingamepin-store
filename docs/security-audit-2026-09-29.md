# Website security and reliability audit — 29 September 2026

## Release scope

Audited the deployable production checkout at `codex/giftport-connection`, based on production commit `c2546b4b` plus the already-tested B2B receipt refresh button. Unpublished multivendor development was excluded. Focused fixes were also mirrored into the working project.

## Changes

- **Legacy checkout validation bypass:** `/api/binance-pay/orders` called the order-creation database function directly, skipping newer application checks for restricted payment methods, product visibility and purchase limits. It now shares the existing `/api/orders` handler. The current storefront and B2B handler remain the source of checkout validation.
- **Email-based account access:** order history, invoices, invoice creation and email-linked wallet refunds now explicitly require a confirmed email. This removes reliance on the authentication provider always withholding sessions from unconfirmed addresses. Existing confirmed customers keep access.
- **Administrator MFA consistency:** the existing seller-application administration guard now uses the same enrolled-factor check as other administration routes. Factor-service errors deny access. This does not enable unpublished multivendor features.
- **Private-response caching:** customer discounts/profile details, wallet, order, support-chat and administration APIs explicitly send `Cache-Control: private, no-store` unless a route supplies its own stronger private policy.
- **Order notification failure:** missing SMTP configuration previously threw while constructing the notification batch, causing an already-completed order action to fail. The mail wrapper now returns a rejected promise so the existing per-recipient failure handling runs. Payment and delivery updates are unchanged.
- **False manual-completion success:** completing an order whose status had already changed could report success despite updating zero rows. Completion now requires a returned updated row and does not send a completion notification after a no-op.

## Validation

- Dependency audit: 0 known vulnerabilities reported by npm audit (485 dependencies).
- Production build and TypeScript: passed.
- Broad ESLint baseline: 0 errors, 9 existing warnings. Focused lint on changed application files: passed.
- 197 automated checks passed. Coverage includes wallet idempotency and rollback, refunds, stock, pricing, channel restrictions, KYB authorization, receipt privacy, administrator guards, legacy checkout delegation and SMTP failure handling. Database checks use disposable PGlite instances.
- Browser fixtures passed for portal filters and navigation stability, interrupted quote recovery, wallet-only confirmation, range pricing/cart payloads, KYB documents/form controls and independent product-channel switches. No real orders or uploads were submitted.
- Live read-only HTTP checks: 50 valid public pages returned 200 without the checked server error signatures. Two additional guessed paths correctly returned 404; the actual `/support` and `/terms` pages returned 200.
- Eight live protected-page/API checks redirected to sign-in or denied access without exposing private content.
- Anonymous HEAD-only database checks across 16 private tables returned denied access or zero visible rows. No private records were downloaded.
- No configured server-secret values found in 21 public JavaScript assets fetched from the existing live site or in all 217 browser bundles built for this release.
- Local production-server checks: 15 rejection/cache checks passed, including unsigned payment callbacks, signed-out B2B checkout and private response headers.
- Local production-browser checks: 24 page/viewport combinations passed (12 routes at desktop and mobile sizes), with no uncaught browser errors or horizontal overflow. The login CAPTCHA performs background requests, so rendering checks use DOM readiness rather than waiting for network silence.
- Existing anti-framing, MIME-sniffing prevention, HTTPS, referrer and browser-permission headers were present on the live site.

## Limits

This was a source audit, regression run, public-site check and anonymous access assessment, not proof that every possible vulnerability is absent. Signed-in customer/admin workflows were tested with isolated fixtures; a live authenticated cross-account penetration test was not performed. No real payments, refunds, supplier purchases, customer messages or document uploads were made. Infrastructure, payment-provider accounts, exhaustive production RLS/privilege inspection and distributed abuse/rate-limit testing remain outside the verified scope. No SQL migration is needed for these fixes.
