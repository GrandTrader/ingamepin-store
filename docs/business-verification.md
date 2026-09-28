# Business verification and SBI wallet deposits

Customer entry: `/account/business` (also linked from Wallet and account navigation).
Admin entry: `/admin/business-verification`, with bank settings and deposit review links.

## Manual KYB

Verified-email customers provide their entity, registration, address, authorized contact, business activity and owners. Registration, address and ownership documents are required (PDF/JPG/PNG, maximum 1 MB each). Files are stored in a private bucket and downloaded only through authenticated owner/admin checks; admins must satisfy the existing MFA policy.

Administrators approve or reject pending applications, with a customer-visible reason. Approved applications can be revoked. Rejected/revoked customers can submit a new revision. Decisions use revision checks and produce audit events. This approval grants business-buyer access, not marketplace seller permissions.

New bulk product orders require approved KYB. Customers registered as resellers require approval for new retail product orders too. The database checks persisted product IDs, not client-supplied bulk flags. Existing orders are not modified. Retail customers without reseller enrollment can continue buying ordinary retail products.

Web checkout binds the customer to the authenticated session. Bulk API orders use individual API keys whose contact email matches a verified, KYB-approved customer account. The shared master key cannot place new business orders. Existing key owners must complete KYB before their next order.

## SBI bank deposits

Bank transfers start disabled. The admin-only settings page contains draft statement details; the account number, full branch address, SWIFT and USD correspondent routing must be checked with SBI. Enabling requires complete instructions and explicit bank confirmation. Only approved customers see enabled instructions.

Customers submit the USD amount sent, sender, transfer reference and receipt. Uploading a receipt does not change any wallet balance. Pending requests are capped at three per customer; amounts are USD 10–50,000, matching the current wallet top-up maximum.

Admins check actual settled bank funds, then record the unique bank reference, received currency (INR or USD), net amount received and conversion rate. USD receipts use rate 1; INR receipts are divided by the recorded INR-per-USD rate, rounded to cents. The credit cannot exceed the customer's declared USD deposit. The approval form previews the credit and requires confirmation. Rejections never credit money.

Crediting, the USD wallet update, the ledger entry and the deposit decision run in one database transaction. Row locks and unique bank references prevent duplicate credits. Repeating an already successful approval returns its existing credit. Revoked/unverified customers and disabled/non-USD wallets cannot receive credits through this flow. The bank instructions used at submission are saved with the request.

No automatic SBI balance lookup, transfer collection, invoice issuance, forex quote or bank settlement is performed. Bank confirmation and receipt matching are manual.

## Release

Apply `supabase/migrations/20260928_140000_business_kyb.sql` to the website's Supabase project before deploying these routes. It adds private business tables, storage, review/deposit functions and the business-order trigger. The existing database needs `create_store_order`, bulk API clients and the current wallet tables. All new callable mutation functions are service-only.

Deploy the isolated release after the SQL succeeds. Leave bank transfers disabled until SBI confirms the routing details. No live customer applications, purchases or wallet credits are created by the tests.

Validation: `scripts/tests/business-verification-db.cjs` (PGlite), `scripts/tests/business-verification.cjs`, scoped ESLint and production Webpack build.


## KYC and KYB form update

New applications collect five private files: representative photo ID and personal address proof (KYC), plus business registration/tax certificate, registered address proof and ownership declaration (KYB). Each is PDF/JPG/PNG, maximum 1 MB. Required identity document type and representative role are stored with the application; no separate ID number is collected.

The customer form has searchable country suggestions, a phone country-code selector with server-side number validation, address lines 1/2, city, state/province and PIN/postal code. India requires a six-digit PIN; international applicants can indicate an address without a postal code. The server derives the combined address and normalized international phone rather than trusting legacy flat fields.

Purchasing purpose now offers Resale to customers, Business use/rewards/gifting, or both. Internal values remain compatible with existing purchase gates. The computed monthly Retailer/Reseller tier is independent of that selection.

Admin review groups personal KYC and business KYB separately, labels missing legacy documents, and requires all five document paths and the current revision before approving through the review action. Existing approved applications are not automatically revoked. Reject/request corrections on an older pending application so the applicant can provide the new documents.

The existing service-only submission RPC and JSON document fields support the additional files; no new database migration is needed. KYC files use the existing private bucket and owner/admin-MFA download controls. Tests cover validation, submission, private access, incomplete/stale approval rejection, and temporary-database persistence of KYC keys. Browser tests use sample files and do not upload them to Supabase.
