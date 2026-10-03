# Approved promoter management

Marketing → Approved Promoters opens `/admin/affiliates/approved`. It lists approved accounts with their current registered email, status, and existing commission controls. Email search is immediate, case insensitive, accepts part of an address, and searches the entire loaded directory. Results display 25 promoters at a time.

Affiliate Applications lists pending, rejected, and suspended accounts. Both pages link to each other. Saving a promoter returns to the originating tab and retains the email search. Changing status moves the promoter into the corresponding directory after saving.

The server verifies administrator access before resolving promoter emails through the existing auth admin API. It loads only accounts for the selected directory and limits email lookups to six concurrent requests. No database migration is required. No commission rates or earnings are changed merely by opening either page.

Checks: `scripts/tests/approved-promoters.cjs` and `scripts/tests/approved-promoters-ui.cjs` use isolated fixtures; no customer records or messages are changed by the tests.
