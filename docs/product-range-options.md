# Product range denominations (local implementation)

Every product’s Product options screen now has a separate Range denomination form. Fixed options keep their existing prices and delivery settings. Presets populate Apple India INR 100–10000 and Apple USA USD 2–500; administrators must enter the actual USD selling price and pricing basis before enabling.

Migration: `supabase/migrations/20260928_160000_product_range_options.sql`. Not applied to the shared database. No deployment or supplier purchases were performed.

A dedicated custom option is stored with each range. Price is calculated from the selected face value, configured currency, basis and USD selling price. The database calculates the authoritative price and checks bounds/step, regardless of client-supplied prices. Quantities keep product purchase limits; custom customer-information fields remain required.

Manual ranges support Add to cart and Buy now on product pages and directly in the business catalogue when no extra customer fields are required. Paid range items receive the immutable `RANGE_MANUAL` delivery marker and a denomination/currency order label. They bypass fixed code inventory and fixed supplier jobs; administrators use the existing paid-order code batch delivery. Disabling a range stops new purchases without erasing paid-order details.

Automatic supplier range delivery is NOT implemented or activated. The admin can save a disabled supplier configuration, but both the save RPC and checkout block activation until the supplier’s variable-denomination contract is verified and the worker adapter is implemented. Existing Definite Play API orders only contain SKU and quantity, and GiftPort purchasing is not activated. Await the user’s supplier selection and variable-value API documentation; never invent an amount parameter or fall back to a fixed SKU. No automatic fallback after an uncertain supplier purchase is permitted.

Validation:
- product-range-db.cjs: isolated PostgreSQL price/bounds/steps, manual delivery payment gate, INR/USD, enabled/disabled, supplier separation, migration reapplication and admin permissions. Covers both original and seller-aware instant delivery functions, reserved seller stock, retry safety, preserved permissions, and rollback for unknown function definitions.
- product-range-ui.cjs: browser cart/Buy now payloads, exact price rounding, invalid denomination and quantity.
- Existing portal access tests, supplier quantity checks and browser filter stability pass.
- Isolated production build and type check pass.

The admin form now shows currency, minimum, maximum and one clearly labelled USD selling price, with a live example. Increments, pricing amount and delivery configuration are under Advanced settings; existing saved values are retained. The business catalogue displays range options as compact table rows with card value, live discounted price, quantity buttons and Add. Different entered values remain separate draft/cart lines; adding the same value merges only that value. Fixed options continue alongside them. No additional migration is required for this interface update.
