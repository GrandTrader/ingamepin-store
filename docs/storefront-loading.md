# Storefront loading

Use `getStoreCategories`, `getStoreProducts` and `getStoreOffers` from `lib/store-catalogue.ts` for public category, collection and search views. These loaders share public-only data for 30 seconds. Product detail display data uses the same cache tag. Do not put sessions, personal discounts, wallets, purchase history, customer answers or delivery codes in these caches.

After product, option, discount, stock, category or visibility mutations, invalidate `homepage-store-data`. Customer checkout and price validation must continue to read fresh data. Discount expiry is also evaluated against the current clock in the customer UI.

Use `NavigationLink` for internal links. Known public routes receive bounded full-page preparation; other and future routes retain the framework default. Add new public information routes to `lib/navigation-prefetch.ts` if full preparation is appropriate. Do not prefetch payment, account-action, token-bearing or mutation URLs. Keep secondary content, such as reviews, behind its own Suspense boundary.

`lib/supabase/server.ts` reuses verification only within a React render pass. Proxy verification is unchanged. Server Actions and API handlers continue to verify each call. Never use a persistent cache for authentication.

Run `npm run test:storefront` and a production build. CI runs the regression tests on pushes and pull requests. For release verification, run `scripts/tests/site-page-sweep.cjs` against a production-mode server and `scripts/tests/storefront-navigation-ui.cjs` in an isolated browser. Measure direct visits and unprepared links as well as prepared links. Report signed-in pages as unverified unless exercised with an authorized test session. Network latency and new page-specific queries can still affect future pages.
