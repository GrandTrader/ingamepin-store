# Customer-requested full-order refunds

Deploy `supabase/migrations/20260927_180000_customer_order_refunds.sql` in the existing Supabase SQL editor before deploying the website code. This migration requires the installed Definite Play and manual-delivery-receipt migrations. It creates no actual refund and changes no existing order or balance during installation.

Signed-in customers with verified email can request a full refund on their order receipt after payment confirmation and before any delivery. Order ownership, confirmed payment amount/currency, service receipts, sold codes, existing item refunds, and submitted supplier jobs are checked inside a transaction. A partially delivered or previously refunded order needs the existing admin item-refund workflow instead. A supplier purchase already submitted must be reconciled by support first.

Customers select wallet credit, an enabled website payment method, or their original method even if checkout has since disabled it. Other receiving methods require destination details. Methods are checked again in SQL. No bank credentials, password or OTP is requested. Refund amount is the stored full order total; clients cannot set it.

The new **Orders & sales → Refund requests** queue lists pending reviews and approved transfers, with a separate history view. Administrators can also act from the order receipt. Approval credits WALLET refunds atomically and exactly once. Other methods use a manual payout: approval does not send money. The administrator sends the refund through the provider, then confirms completion with its transaction reference. There are no automatic external payout API calls. Approved external transfers cannot be declined, avoiding a delivery restart after money may have been sent.

Requests pause delivery. Order-row locks and database guards block service delivery, code sale/reservation, submitted supplier purchases, status changes, and competing item refunds. Unsubmitted QUEUED supplier jobs are paused and restored on rejection. Rejection leaves payment unchanged and resumes eligibility for delivery. External approval keeps the order paid/processing; completion cancels it, marks its payment refunded, releases reserved codes, and writes a permanent refund record and dated audit events. Wallet transaction references connect the wallet ledger to the original order. No live customer refund is issued by installation or tests.

Refund tables and mutation RPCs are service-role only. Customer actions verify authentication and pass the session identity; admin actions additionally require the existing admin MFA/session checks and membership. Raw backend errors are not sent to customers. Customer/admin pages load order-scoped refund history only after access checks.

Validation:

- `node --test scripts/tests/customer-order-refunds.cjs`
- `PGLITE_PATH` pointing to the isolated PGlite package: `node scripts/tests/customer-order-refunds-db.cjs`
- Targeted ESLint and a clean-release production build.

No production browser test or live money transfer is required to install this feature. After installation, verify the request and review screens with a controlled paid test order before using real external transfers.


## Network fee deductions

Apply `supabase/migrations/20260927_210000_customer_refund_network_fees.sql` before releasing the fee UI. It preserves all existing requests with zero deducted fees. New Direct USDT requests deduct USD 4.50 for TRC20, USD 2.50 for Solana, USD 0.50 for BEP20, and USD 3.50 for another named crypto network. Paypalych/PALLY, FreeKassa, wallet and other non-network payment methods have zero commission; Binance Pay is an off-chain payment method. Crypto requests currently require the order currency to be USD; no unverified exchange rate is applied to foreign-currency orders.

The database calculates and snapshots the fee and generated net payout, never trusting browser amounts. A request whose fee consumes the order amount is rejected atomically, without leaving a delivery hold. Repeated requests retain the original agreed fee. The original order amount remains the basis for payment validation; external transfers pay the net amount. Admin completion explicitly confirms that amount and records the net payout and fee in the event history. Wallet credits remain the full order amount with zero fee. No external transfer is initiated automatically.


## Per-order admin enablement

Apply `supabase/migrations/20260927_220000_order_refund_permission.sql` before releasing the per-order switch. Every order starts with customer refunds disabled. In the admin order receipt, **Customer refund option → Enable refund option** allows a customer to request a refund for that order only, subject to all existing payment/delivery checks. Only authenticated administrators can change this setting. The permission table is read-only to the service role; writes go through the admin RPC. A trigger verifies enablement under the same order lock as the request, preventing stale pages or direct requests from bypassing disablement.

Existing refund requests remain reviewable and their history remains visible. The switch is locked after a request exists, so an administrator must review that request rather than silently remove it. Declined requests can be followed by another request if the order remains enabled and eligible. Enabling does not pause delivery; submitting a valid refund request does.
