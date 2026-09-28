# B2B portal wallet confirmation

Status: prepared and tested locally; database activation is pending. Do not deploy before the requested localhost acceptance test.

Apply `supabase/migrations/20260928_223000_portal_wallet_checkout.sql` as a complete transaction after the existing business KYB and product range migrations. It adds a service-only checkout function and idempotency table, without replacing existing retail checkout functions.

The portal draft proceeds to an in-portal confirmation. Only an authenticated, email-verified, approved KYB customer can confirm; the server forces wallet payment and prices products using database values. The review leaves no order, payment, stock reservation, or supplier job behind. Confirmation creates and pays the order atomically. Failed stock checks, stale prices and insufficient balance roll back the entire order. The optional customer reference is saved in the order note.

New portal order numbers use IPB2B + YYYYMMDD (Asia/Kolkata) + six random digits. Existing orders and the retail order number generator remain unchanged. Internal UUID identifiers are preserved.

A persisted customer/request key recovers a committed result before current stock checks. A lost confirmation response can be retried after reload without another order or wallet debit. Existing order, wallet and delivery notifications run after commit and cannot change a successful payment result.

Manual range delivery and existing automatic fixed-code delivery are supported. Products requiring extra delivery details were already excluded from quick-add; they remain unavailable in this table. Supplier range delivery remains subject to the existing range configuration restrictions.

Validation: production Webpack build and TypeScript, scoped ESLint, isolated PostgreSQL transaction tests, route authorization/parser tests, and browser tests for stable filters, range quantities, portal review, retry after reload, and unchanged retail cart. No real customer orders or wallet charges were used for testing.
