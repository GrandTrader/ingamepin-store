# InGamePin multivendor setup

## Confirmed rules
- Sellers require administrator approval, verified email, government ID, physical ID photo, and face/liveness verification.
- Sellers already trading elsewhere must provide marketplace statements.
- Record explicit acceptance of a versioned declaration prohibiting gambling-related transactions, fraud, money laundering, unlawful funds and stolen/redeemed codes.
- Categories and category images belong to the administrator. Sellers create products in existing categories; the image comes automatically from the category. Show the seller username clearly below the product image.
- New seller products need administrator approval before publication. Sellers can request categories.
- Support automatic voucher delivery and manual fulfilment.
- Seller product controls include title, description, region, price, discount, bulk discount and customer-specific discounts.
- Charge 1.5% on the final product amount after discounts, excluding payment gateway fees. Round monetary charges to cents using decimal/integer arithmetic when settlement is implemented.
- Sellers bear gateway fees by default. Choose who pays separately for each product during seller product creation, not during registration or in the seller profile. Show buyer fees before confirmation.
- Show earnings pending in a seller wallet; start a 36-hour hold at completed delivery. Disputed orders remain held until resolved.
- Withdraw only in USDT. Fixed per-withdrawal fees: TRC20 USD 5; BEP20 USD 2.50; Solana USD 2.50. No additional withdrawal charge.

## Stage 1: applied by owner, database availability confirmed
Migration: supabase/migrations/20260910_190000_seller_foundation.sql

Adds private onboarding, evidence references, category requests, product submissions and marketplace fee settings. It does not modify existing products, orders, customer wallets or payouts. Client writes are disabled; evidence has no client read permissions. Only approved and verified sellers can submit products, and the category must have an admin image.

## Later stages
- Seller application and admin review screens; choose supported seller countries and a verification provider before enabling ID/selfie uploads. Establish the evidence deletion period and implement cleanup before collection.
- Catalog publication, automatic category-image display, seller username, inventory and discount permissions. Decide which post-approval edits need review before enabling edits.
- Checkout seller attribution and fee allocation, including mixed-seller orders and refunds. Seller/customer wallets must remain separate.
- Auditable seller ledger with idempotent delivery settlements, 36-hour maturity, dispute holds and refund reversals. Duplicate callbacks must never duplicate earnings.
- USDT withdrawals with balance reservation, authenticated payout-address changes, network/address validation, payout approval and transaction reconciliation. Never mark a payout paid without a confirmed transaction.

Payment and wallet automation are not enabled by this foundation migration.

## Stage 2: seller applications and admin review (local)
Seller entry: /seller; admin queue: /admin/sellers. Uses the existing customer login. Applications record the declaration version/time; verified email/phone flags are sourced only from Supabase Auth. Rejected applications can be resubmitted with checks reset. Only admins with completed MFA can review; approval requires all recorded checks and database constraints. Country selection records location and does not guarantee eligibility. Provider verification, evidence collection and product publishing remain unavailable.

Gateway fee choice has been removed from onboarding. Add the per-product field and its migration with seller product creation; the existing account-level database column is unused by onboarding.

## Marketplace proof form update (local, migration pending)
Registration now asks for Name and Surname. Selecting Yes for other marketplace sales requires a PDF/JPG/PNG account statement or screenshot, maximum 5 MB. Server validates size and file signatures, uploads to a private bucket, and stores the reference with the application. Uploaded proof does not count as verified. Admin-only download uses authenticated access and no-store attachment responses. Failed application writes attempt upload cleanup; replaced proofs are also removed. Apply 20260910_200000_seller_marketplace_proof.sql before testing submission. Define proof retention and scheduled orphan cleanup before public rollout. Other identity verification remains unavailable.

Seller address update (local): Name and Surname share a row, including mobile. Full address captures two street lines, city, optional district, state/region and manual postal code. Indian PINs require six digits. Other countries can omit postal code if not applicable. No postal lookup service is connected. Apply 20260910_210000_seller_address.sql before submitting. Existing applications are preserved.

Email/IP update: mobile remains a validated contact field, but phone ownership verification is no longer required. Submission requires confirmed Supabase Auth email. Keep ID/physical ID/face/marketplace checks. Migration 20260910_220000_seller_email_and_ip.sql removes only the phone verification approval condition and adds submission_ip. Store latest submission IP from Vercel-overwritten x-forwarded-for only, validate IPv4/IPv6, reject header chains; local/unconfigured hosting stores null. A proxy may be the observed address (see https://vercel.com/docs/headers/request-headers). Do not use IP as identity proof. RLS restricts it to the account owner/admin; no public profile exposure. Form discloses collection.

## Didit webhook inbox (local, migration pending)
POST /api/didit/webhook uses exact-byte X-Signature HMAC-SHA256, constant-time comparison and a five-minute signed timestamp window (https://docs.didit.me/integration/webhooks). Rejects oversized bodies (1 MiB) and malformed session events. Persists only event/session ID, environment, event type, status and timestamps. Event ID uniqueness handles retries; database failure returns 503 for redelivery. No raw decision/ID/selfie payloads are stored. Test/live events are labelled and neither updates seller verification at this stage. Apply 20260911_010000_didit_webhook_inbox.sql. Still required: session creation/ownership mapping, authenticated decision retrieval, score >=80 plus passed ID/liveness, stale result handling, and deployment with environment-specific secrets. Original physical ID photo review and final admin approval remain separate.

## Seller Didit Sandbox session flow (local)
Apply 20260911_020000_didit_seller_test_sessions.sql. After a PENDING application, an authenticated seller with verified email can start/continue a Sandbox session and explicitly check its result. Each session is bound to seller, application submission and workflow; provider vendor_data is the internal session-row UUID. Session links are service-role only and never exposed in public profiles. Concurrent creation claims use an optimistic timestamp guard and provider idempotency; retries wait one minute. Results are retrieved directly from Didit with the server key, checked against session/workflow/vendor/environment, and store only status, minimum face score and pass/fail. Require Approved session, all ID/liveness/face nodes Approved, and finite face scores >=80 and <=100; missing values fail closed. Sandbox results never update seller_accounts or approve sellers. Browser callback status is ignored. Provider-hosted redirect handles camera capture. Local callback uses localhost:3000; cross-device callbacks need deployed hosting. Original ID-holding photo review, live-mode enablement, automatic webhook processing and failed-session resubmission remain later steps. Webhook inbox continues to retain metadata only.

## Live Didit connection (local, migration pending)
Apply 20260911_030000_didit_live_sessions.sql. All three DIDIT_LIVE_* credentials select the live flow; Sandbox records stay in their separate table. Creation and result retrieval confirm environment/session/workflow/vendor binding. Server-only apply_didit_live_result locks the session and seller, compares the previous update version and application submission timestamp, and sets ID/face timestamps only on PENDING applications passing all checks with score >=80. A database approval constraint also requires live environment and score >=80. Never sets physical_id_verified_at, marketplace statement verification or seller APPROVED. Resubmission clears live markers. Webhook secrets are environment-bound; valid live metadata causes a fresh authenticated decision fetch (three-second timeout), not trust in posted decision. Errors return 503 for retry; duplicate unprocessed events retry. Unknown sessions remain inbox-only and can be recovered by seller Check result. Post-approval monitoring/suspension, retry UX and independent ID-holding-photo review remain separate work. No live checks were initiated during implementation; no deployment performed. Tests: TypeScript/ESLint, isolated PostgreSQL migration/RPC checks, signature-environment isolation, score boundary and missing-score validation.
