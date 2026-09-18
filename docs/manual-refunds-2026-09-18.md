# Manual denomination refunds

Local implementation; no production deployment or customer refund was performed.

Apply `supabase/migrations/20260918_230000_manual_item_refunds.sql` in the existing project's Supabase SQL Editor before using the new form. This additive migration preserves existing refunds and wallet-refund functions. It does not transfer or credit any money.

Admin order receipt: Refunds by product / denomination > Record manual refund. Enter quantity, actual amount in the order currency, Wallet or Payment method, refund transaction ID, reason, and confirm the money has already been returned. The existing Issue wallet refund button still credits the wallet and must not be used to record money already returned.

The record stores the administrator, time, destination and reference. Duplicate identical submissions return the existing record. Reusing the reference for different details is rejected. Quantity, denomination balance and total order balance limits are checked under database row locks. Pending wallet claims count toward limits to prevent double refunds. Only the server role can execute the RPC; the action requires an authenticated administrator and the existing MFA guard.

Each denomination shows a full or partial manual refund label and the reference. Customer receipts show the refund and reduce remaining delivery. When all quantities are settled by credited/manual refunds, the order changes to REFUNDED; receipt headers show MANUALLY REFUNDED when applicable. Partial refunds retain the order workflow status. Existing delivered voucher codes are never returned to stock. Payment records are not rewritten as a gateway refund.

Validation: ESLint; application/input/security tests; actual SQL migration on an isolated PGlite PostgreSQL database, including caps, item ownership, paid order checks, retry idempotency, permissions and partial/full statuses. No live financial writes were tested.

The workspace has pre-existing TypeScript errors in generated product route types and an old deployment artifact that imports the removed nowpayments module.
