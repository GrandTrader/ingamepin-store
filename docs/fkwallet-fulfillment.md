# FKWallet automatic delivery

The integration is opt-in per imported product. Imports remain manual drafts until
delivery is enabled in the product's Supplier tab. Payouts are not implemented.

## Rollout

Install `supabase/migrations/20261013_170000_fkwallet_fulfillment.sql` after the
three existing FKWallet migrations. This does not activate products or spend
funds. The migration extends the protected supplier queue with provider
`FKWALLET`; the existing Definite Play worker continues claiming only its own jobs.

Set `FKWALLET_FULFILLMENT_ENABLED=true` on the website server. Set a matching
`CRON_SECRET` of at least 24 characters on the website and scheduler. Keep existing
FKWallet keys in their current encrypted storage or supported server environment.
Restart the website after changing its environment.

Run `node scripts/fkwallet-worker.cjs` from this checkout with `FKWALLET_WORKER_URL`
pointing to the intended website origin. It defaults to `http://localhost:3000`
for local review. A production scheduler must run continuously on an always-on
server. Alternatively call `/api/cron/fkwallet` regularly with the same bearer
secret. There is no Vercel cron entry added automatically.

The Supplier tab requires a heartbeat less than three minutes old before enabling
delivery. Select **Activation on the customer's account** for Telegram Premium;
select **Digital code to the order page** for code products. The switch does not
publish a draft. Supplier stock checks update availability, not selling prices.

## Delivery rules

- Only verified paid USD website orders are claimed. The existing net-revenue,
  cancellation and refund protections apply to FKWallet as well.
- Each unit has a durable request key and encrypted request/result. The database
  records submission before the supplier purchase call. A lost purchase response
  is held for review and is never automatically submitted again.
- Supplier price, currency, field schema, recipient details and balance are checked
  before purchase. Price increases above the imported cost are held for review.
  The import's saved exchange rate is the cost conversion basis, not a live FX quote.
- Delivery status comes from the signed public `history` API: operation
  `OnlineProductOrder`, matching `info.id`, and named `info.status`. The wallet
  ledger row ID and numeric `/op/status` values are never treated as delivery proof.
- A code order requires confirmed history success and a matching `/op/status`
  response containing a real code. Account activation requires confirmed history
  success and a matching result. Every unit must succeed before the item completes.
- Results appear on the existing customer order page. This integration does not
  send an additional delivery email. Recent automatic jobs and review reasons
  appear on the product's Supplier tab.
- Missing history, unknown statuses and transient read failures do not complete
  orders. History searches are bounded to five pages; unmatched records remain
  unconfirmed. A pending purchase older than 24 hours requires review.
- A timeout after purchase submission or a partially completed multi-unit order
  needs supplier reconciliation before refunds or replacement purchases. Never
  clear submission markers or create a replacement to resolve an ambiguous result.

## Verification

Run `npm run test:fkwallet`, `npm run test:fkwallet-ui`, and `npm run build`.
Database tests run against isolated PGlite. Browser tests mock supplier actions.
No live purchase is needed for these checks. A read-only comparison on the
connected account verified that a completed digital purchase's history ID matches
`/op/status/{id}` and returns the documented named success status.
