# Website security and reliability audit — 17 September 2026

Deployment approved by the user for GrandTrader/ingamepin-store main. Release completion is verified separately after publishing.

Reviewed the production website source at f106293 and applied focused fixes in an isolated checkout. Unpublished multivendor features were excluded from the release. This is a code review and non-destructive automated audit, not proof that every vulnerability has been eliminated.

## Findings fixed

| Priority | Finding | Correction |
| --- | --- | --- |
| Critical dependency advisories | Next.js 16.3.0 was within published affected ranges; npm also flagged Nodemailer, Sharp, Browserslist, js-yaml, and baseline-browser-mapping. Exposure depends on the advisory: the Windows-hosting issue is particularly relevant to local Windows servers. No exploit was attempted. | Next.js and eslint-config-next updated to 16.3.5, Nodemailer to 9.1.1, Sharp and affected transitive packages updated to patched versions. Full and production-only npm audits report zero known vulnerabilities. |
| High | Public order tracking used SQL pattern matching for the supplied email. Wildcard input could match an email that the requester did not actually supply, potentially exposing order details and delivered codes when an order number was known. | Retrieve the order by its number, then require an exact case-insensitive email match before retrieving any delivered codes. Regression tests cover wildcard and near-match rejection. |
| High | Admin API handlers and many Server Actions verified admin membership but did not independently enforce an enrolled second factor. Page middleware alone was insufficient; its factor-lookup error path also failed open. | Added a shared, fail-closed assurance check to admin APIs and a guarded session client for admin Server Actions. Explicit admin middleware matchers cover paths with file-like suffixes. Existing admin-role checks remain. |
| Medium | Admin push subscriptions accepted arbitrary HTTPS destinations. Sending a push could contact an attacker-selected server; requests could also hang without a timeout. | Restrict endpoints to supported browser push services, reject credentials/custom ports, reject redirects, validate both on registration and send, and limit requests to 10 seconds. |
| Functional | Customer receipts counted only voucher codes. Completed UID/account purchases could show remaining delivery and their invoices could return not found. | Use service-completion timestamps and legacy delivered-service status for receipt progress and invoice eligibility. Invoice links now respect the invoice route's completed-order requirement. |

## Verification

- Production build and TypeScript compilation passed on Next.js 16.3.5.
- Five regression test groups passed: MFA, push destinations, order email matching, admin action guard coverage, and service-delivery progress.
- Broad ESLint scan: zero errors; nine pre-existing advisory warnings concerning image optimization and unused declarations remain.
- 45 public routes from the sitemap and key customer pages loaded without HTTP errors against the patched production build.
- Six customer pages at 320, 390, and 1440 pixels: 18 checks with no uncaught page errors or horizontal overflow. This is automated layout checking, not exhaustive visual/accessibility validation.
- Unauthenticated admin/customer pages redirected to login; tested admin and bulk APIs denied access. The wallet balance endpoint intentionally returns an anonymous zero balance, not a customer's balance.
- Anonymous HEAD-only requests against 12 sensitive database tables returned no records or permission denial: orders, order_items, payments, gift_card_codes, customer_wallets, wallet_transactions, wallet_topup_requests, profiles, admin_users, support_messages, saved_invoices, admin_push_subscriptions.
- Scanned 177 generated browser JS/JSON files for configured private environment values: no matches. No secret values were printed.
- Reviewed order/payment token checks, signed payment callbacks, account ownership filters, initial RLS policies, privileged function grants, and raw HTML rendering paths. This review was selective, not exhaustive across every payment provider and migration.
- No actual purchase, top-up, refund, delivery confirmation, or notification was triggered during testing.

## Limits and follow-up areas

No authenticated cross-account browser penetration test or real payment settlement was performed. Live database policies beyond anonymous visibility, hosting firewall/distributed rate limits, infrastructure configuration, external gateway services, and all historical data were not fully verified. The absence of known package vulnerabilities does not guarantee application security. A dedicated authenticated test environment is needed to test those flows without risking customer transactions.

Local unpublished features remain unpublished. Their admin action imports received the same session guard where applicable, but this audit does not certify the full multivendor implementation. Local scratch/generated artifacts can still affect a broad local TypeScript invocation; the isolated production build is the release validation.

## Advisory references

- [Next.js Windows-hosting advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [Next.js image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
- [Nodemailer access-restriction advisory](https://github.com/advisories/GHSA-8m3c-c648-2xjj)

Regression command: `node --test scripts/tests/security-regressions.cjs`.
