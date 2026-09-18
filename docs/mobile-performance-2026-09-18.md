# Mobile performance diagnosis — 18 September 2026

## Measured baseline
Read-only public production checks in isolated Chrome, 390 × 844 viewport (desktop host network, not a physical phone or throttled mobile connection):

| Route | Response start | DOM ready | Requests after 2.5 seconds |
| --- | ---: | ---: | ---: |
| / | 267 ms | 1300 ms | 86 |
| /products | 71 ms | 453 ms | 59 |
| /account | 75 ms | 168 ms | 59 |
| /admin/login | 70 ms | 117 ms | 42 |

These samples do not establish authenticated mobile page speed or production improvements. The homepage included 0.8-second catalog/category requests and a 1.5-second third-party analytics download; an asynchronous resource duration is not itself a page-blocking delay.

## Confirmed implementation bottlenecks and local fixes
- Stock page waited for optional external DigiSeller catalog/login requests without timeouts. It now fetches that section only on request, behind its own streaming boundary, with a shared 10-second abort signal through login/catalog fetches.
- No general route loading boundaries: added root, admin, account, and product-editor loading states. These improve navigation feedback/partial prefetching; they do not eliminate database wait time.
- Account dashboard loaded all orders/items and every delivered voucher value before showing five orders. It now uses database filtering and five-row pagination, stable ordering, count-only totals, and customer email ownership filters on every privileged query. Delivered codes stay on order receipt pages.
- Global translator observed and rescanned the entire page even in English. The dictionary/engine now mounts only for non-English storefront pages; mutation work is batched per animation frame, and English text is restored on cleanup. Admin routes never mount the engine.
- Admin notification polling ran every five seconds and allowed overlapping requests. It now polls every 15 seconds, skips hidden tabs, refreshes on return, prevents overlap, aborts after 10 seconds, and cancels on unmount. This reduces steady-state polling by two thirds; push notifications are unchanged.
- Admin header loaded storefront category/product queries. These are skipped on admin/seller routes where product search is hidden and loaded when returning to storefront.
- Proxy checked role then MFA serially. Independent checks now run in parallel; both remain mandatory, fail-closed, and private data is not cached.

## Validation
- Edited files pass ESLint.
- Four targeted pagination/authentication/translation regression groups pass.
- Five existing security regression groups pass.
- Read-only live count query verified the nested order ownership filter works.
- Local mobile browser: home, account/login, admin/login return 200; no page errors; content fits 390-pixel width.
- English browser only fetches the 587-byte development async-loader stub, not the translation dictionary chunk.
- TypeScript reports the same two pre-existing errors: invalid renderProductPage export in product page generated types and missing nowpayments import in old artifacts. No new type errors reported.

## Scope and remaining verification
Not deployed. Multivendor work is not part of this change. No orders, stock, payments, or customer records were mutated for testing. Authenticated admin/customer UI was not exercised with a real signed-in session. Every individual route has not been benchmarked; a physical phone comparison after deployment is still required. Do not present local development timings as production speed gains.
