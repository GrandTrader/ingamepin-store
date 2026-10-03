# Partial manual delivery

Manual code delivery accepts any nonempty batch up to the outstanding quantity, including products not marked as bulk orders. For example, send 500 codes against an order for 1,000, then send the remaining 500 later. Refunded quantities reduce what may be delivered. Final order completion still requires every item to be delivered or refunded.

The review shows 100 codes per page, with the batch size and quantity remaining afterward. Parsing is memoized, duplicate codes are highlighted before review, and successful saves update the remaining quantity immediately. Email continues separately after the database commits. Failed or uncertain requests retain the entered codes for a safe retry.

Apply `supabase/migrations/20261003_150000_partial_manual_code_delivery.sql` before deploying the updated form and delivery helper. This migration preserves manual-range delivery support, administrator permissions, row locks, code ownership checks, atomic saving, and retry deduplication. It changes no existing deliveries and sends no messages.

Validation uses isolated fixtures only:

- `scripts/tests/manual-delivery-partial.cjs`: partial batches, retries, refunds, overdelivery, rollback, range delivery, and permissions. Requires `PGLITE_PATH`.
- `scripts/tests/manual-partial-upload-ui.cjs`: 500-of-1,000 review, pagination, failed-request recovery, duplicate validation, and immediate remaining count.
- `scripts/tests/manual-code-upload.cjs`: authenticated endpoint, retry safety, and nonblocking email handling.
