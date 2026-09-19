"use client";

import { validateCartStock } from "@/lib/cart-stock";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CartItem = {
  cartId: string;
  productId?: string;
  productOptionId?: string;
  categorySlug: string;
  productName: string;
  amount: number;
  quantity: number;
  email?: string;
  customerInformation?: Array<{ fieldId: string; label: string; value: string }>;
  unitPrice: number;
  totalPrice: number;
  minQuantity?: number;
  maxQuantity?: number;
  isBulkOrder?: boolean;
};

type QuantityLimit = {
  productId: string;
  productOptionId: string | null;
  minimumQuantity: number;
  maximumQuantity: number | null;
  availableQuantity?: number | null;
};

export default function CartPage() {
  const router = useRouter();
  const [stockError, setStockError] = useState("");

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const cartRef = useRef<CartItem[]>([]);
  const limitsRef = useRef(new Map<string, QuantityLimit>());
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const checkoutBusy = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [customerDiscounts, setCustomerDiscounts] = useState<Record<string, number>>({});

  const quantityLookupKey = useMemo(
    () =>
      JSON.stringify(
        cartItems.map((item) => ({
          productId: item.productId,
          productOptionId: item.productOptionId,
        })),
      ),
    [cartItems],
  );

  function loadCart() {
    try {
      const savedCart = localStorage.getItem("shoppingCart");

      if (!savedCart) {
        setCartItems([]);
        setIsLoaded(true);
        return;
      }

      const parsedCart: CartItem[] = JSON.parse(savedCart);

      const safeCart = Array.isArray(parsedCart)
        ? parsedCart
        : [];

      cartRef.current = safeCart;
      setCartItems(safeCart);
    } catch {
      setCartItems([]);
    } finally {
      setIsLoaded(true);
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    if (!isLoaded || cartItems.length === 0) return;

    const lookupItems = JSON.parse(quantityLookupKey) as Array<{
      productId?: string;
      productOptionId?: string;
    }>;
    if (lookupItems.some((item) => !item.productId)) return;

    const controller = new AbortController();
    async function refreshQuantityLimits() {
      try {
        const response = await fetch("/api/products/quantity-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: lookupItems }),
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as { limits?: QuantityLimit[] };
        if (!response.ok || !result.limits) return;

        const limits = new Map(
          result.limits.map((limit) => [
            `${limit.productId}:${limit.productOptionId ?? ""}`,
            limit,
          ]),
        );
        limitsRef.current = limits;
        const updated = cartRef.current.map((item) => {
          const limit = limits.get(`${item.productId}:${item.productOptionId ?? ""}`);
          if (!limit) return item;
          const maximum = limit.maximumQuantity ?? Number.MAX_SAFE_INTEGER;
          const quantity = Math.min(maximum, Math.max(limit.minimumQuantity, item.quantity));
          return { ...item, minQuantity: limit.minimumQuantity,
            maxQuantity: limit.maximumQuantity ?? undefined,
            quantity, totalPrice: item.unitPrice * quantity };
        });
        saveCart(updated);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Server-side order validation remains authoritative if this refresh fails.
        }
      }
    }

    void refreshQuantityLimits();
    return () => controller.abort();
  }, [cartItems.length, isLoaded, quantityLookupKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadDiscounts() {
      try {
        const response = await fetch("/api/customer-discounts", { cache: "no-store" });
        const result = (await response.json()) as { discounts?: Record<string, number> };
        if (!cancelled && response.ok) setCustomerDiscounts(result.discounts ?? {});
      } catch {
        // Cart continues with standard prices.
      }
    }
    void loadDiscounts();
    return () => { cancelled = true; };
  }, []);

  function saveCart(updatedCart: CartItem[]) {
    cartRef.current = updatedCart;
    setCartItems(updatedCart);

    localStorage.setItem(
      "shoppingCart",
      JSON.stringify(updatedCart)
    );

    window.dispatchEvent(new Event("cartUpdated"));
  }

  function updateQuantity(cartId: string, requestedQuantity: number) {
    if (!Number.isSafeInteger(requestedQuantity)) return;
    const updatedCart = cartRef.current.map((item) => {
      if (item.cartId !== cartId) {
        return item;
      }

      const minimum = item.minQuantity ?? 1;
      const maximum = item.isBulkOrder || item.maxQuantity === undefined
        ? Number.MAX_SAFE_INTEGER
        : item.maxQuantity;
      const newQuantity = Math.min(
        maximum,
        Math.max(minimum, requestedQuantity),
      );

      return {
        ...item,
        quantity: newQuantity,
        totalPrice: item.unitPrice * newQuantity,
      };
    });

    const changed = updatedCart.find(item => item.cartId === cartId);
    if (!changed) return;
    const limit = limitsRef.current.get(`${changed.productId}:${changed.productOptionId ?? ""}`);
    const total = updatedCart.filter(item => item.productOptionId === changed.productOptionId)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (limit?.availableQuantity != null && total > limit.availableQuantity) {
      setStockError(`Only ${limit.availableQuantity} code(s) are available for this denomination. Your selected total is ${total}.`);
      return;
    }
    setStockError("");
    saveCart(updatedCart);
  }

  function finishQuantityEdit(cartId: string) {
    const draft = quantityDrafts[cartId];
    if (draft !== undefined && /^\d+$/.test(draft)) updateQuantity(cartId, Number(draft));
    setQuantityDrafts(current => {
      const next = { ...current }; delete next[cartId]; return next;
    });
  }

  useEffect(() => {
    if (!isLoaded || !cartItems.length) { setStockError(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        await validateCartStock(cartItems, controller.signal);
        if (!controller.signal.aborted && cartRef.current === cartItems) setStockError("");
      } catch (error) {
        if (!controller.signal.aborted && cartRef.current === cartItems) {
          setStockError(error instanceof Error ? error.message : "Unable to check stock.");
        }
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cartItems, isLoaded]);

  function removeItem(cartId: string) {
    const updatedCart = cartRef.current.filter(
      (item) => item.cartId !== cartId
    );

    saveCart(updatedCart);
  }

  function clearCart() {
    saveCart([]);
  }

  const totalProducts = useMemo(() => {
    return cartItems.reduce(
      (total, item) => total + item.quantity,
      0
    );
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (total, item) =>
        total + item.unitPrice * item.quantity,
      0
    );
  }, [cartItems]);

  const discountAmount = useMemo(
    () => cartItems.reduce((total, item) => {
      const percent = item.productId ? Number(customerDiscounts[item.productId] ?? 0) : 0;
      return total + item.unitPrice * item.quantity * percent / 100;
    }, 0),
    [cartItems, customerDiscounts],
  );
  const payableTotal = Math.max(0, subtotal - discountAmount);

  async function proceedToCheckout() {
    const snapshot = cartRef.current;
    if (!snapshot.length || checkoutBusy.current) return;
    checkoutBusy.current = true;
    setIsCheckingOut(true);
    try {
      await validateCartStock(snapshot);
      // Never check out an older cart after the customer changes its quantities.
      if (cartRef.current !== snapshot) return;
      setStockError("");
      localStorage.setItem("checkoutCart", JSON.stringify(snapshot));
      localStorage.removeItem("buyNowItem");
      router.push("/checkout");
    } catch (error) {
      if (cartRef.current === snapshot) setStockError(error instanceof Error ? error.message : "Unable to check stock.");
    } finally {
      checkoutBusy.current = false;
      setIsCheckingOut(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-400">
            Loading your cart...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-3 sm:flex-wrap sm:items-center sm:gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-bold text-cyan-400 transition hover:text-cyan-300"
            >
              ← Continue shopping
            </Link>

            {stockError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{stockError}</p>}
            <h1 className="mt-3 text-2xl font-black sm:mt-4 sm:text-4xl">
              Shopping Cart
            </h1>

            <p className="mt-1 text-sm text-slate-400 sm:mt-2 sm:text-base">
              Review your products before checkout.
            </p>
          </div>

          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="shrink-0 rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-400/10 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
            >
              Clear Cart
            </button>
          )}
        </div>

        {cartItems.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-slate-900 p-10 text-center">
            <div className="text-7xl">🛒</div>

            <h2 className="mt-5 text-2xl font-black">
              Your cart is empty
            </h2>

            <p className="mt-3 text-slate-400">
              Add a product to your cart before continuing
              to checkout.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
            >
              Browse Products
            </Link>
          </section>
        ) : (
          <div className="mt-6 grid gap-4 sm:mt-10 sm:gap-8 lg:grid-cols-[1fr_360px]">
            <section className="space-y-3 sm:space-y-5">
              {cartItems.map((item) => (
                <article
                  key={item.cartId}
                  className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:rounded-3xl sm:p-6"
                >
                  <div className="flex gap-3 sm:gap-5">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-3xl sm:h-24 sm:w-24 sm:rounded-2xl sm:text-4xl">
                      🎮
                    </div>

                    <div className="flex-1">
                      <div className="flex justify-between gap-2 sm:gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                            Digital Product
                          </p>

                          <h2 className="mt-1 text-base font-black sm:mt-2 sm:text-xl">
                            {item.productName}
                          </h2>

                          <p className="mt-2 text-sm text-slate-400">
                            Denomination:{" "}
                            <span className="font-bold text-white">
                              ₹
                              {item.amount.toLocaleString(
                                "en-IN"
                              )}
                            </span>
                          </p>

                          {(item.customerInformation ?? []).map((field) => (
                            <p key={field.fieldId} className="mt-1 break-all text-sm text-slate-400">
                              {field.label}:{" "}
                              <span className="text-white">{field.value}</span>
                            </p>
                          ))}
                          {item.productId && Number(customerDiscounts[item.productId] ?? 0) > 0 && (
                            <p className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                              Your {customerDiscounts[item.productId]}% discount
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeItem(item.cartId)
                          }
                          className="self-start rounded-lg border border-red-400/30 px-2 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-400/10 sm:px-3 sm:py-2 sm:text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4 sm:mt-6 sm:gap-5 sm:pt-5">
                        <div>
                          <p className="text-xs text-slate-500">
                            Quantity
                          </p>

                          <div className="mt-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.cartId,
                                  (cartRef.current.find(row => row.cartId === item.cartId)?.quantity ?? item.quantity) - 1,
                                )
                              }
                              disabled={
                                item.quantity <= (item.minQuantity ?? 1)
                              }
                              aria-label="Decrease quantity"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-950 text-xl font-bold transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              −
                            </button>

                            <input
                              type="text"
                              inputMode="numeric"
                              min={item.minQuantity ?? 1}
                              max={
                                item.isBulkOrder || item.maxQuantity === undefined
                                  ? undefined
                                  : item.maxQuantity
                              }
                              step={1}
                              value={quantityDrafts[item.cartId] ?? String(item.quantity)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                if (!/^\d*$/.test(value)) return;
                                setQuantityDrafts(current => ({ ...current, [item.cartId]: value }));
                                if (value && Number(value) >= (item.minQuantity ?? 1)) updateQuantity(item.cartId, Number(value));
                              }}
                              onBlur={() => finishQuantityEdit(item.cartId)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                              }}
                              aria-label={`Enter quantity for ${item.productName}`}
                              className="h-10 w-20 rounded-lg border border-white/15 bg-slate-950 px-2 text-center font-black outline-none focus:border-cyan-400"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.cartId,
                                  (cartRef.current.find(row => row.cartId === item.cartId)?.quantity ?? item.quantity) + 1,
                                )
                              }
                              disabled={
                                !item.isBulkOrder &&
                                item.maxQuantity !== undefined &&
                                item.quantity >=
                                  item.maxQuantity
                              }
                              aria-label="Increase quantity"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-950 text-xl font-bold transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>

                          <p className="mt-2 text-xs text-slate-500">
                            {item.isBulkOrder || item.maxQuantity === undefined
                              ? "No quantity limit"
                              : `Allowed: ${item.minQuantity ?? 1}–${item.maxQuantity}`}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">
                            Product total
                          </p>

                          <p className="mt-1 text-2xl font-black text-cyan-400">
                            $
                            {(
                              item.unitPrice *
                              item.quantity *
                              (1 - Number(item.productId ? customerDiscounts[item.productId] ?? 0 : 0) / 100)
                            ).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit rounded-2xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl sm:p-6 lg:sticky lg:top-6">
              <h2 className="text-2xl font-black">
                Order Summary
              </h2>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Different products</span>

                  <span className="font-bold text-white">
                    {cartItems.length}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Total quantity</span>

                  <span className="font-bold text-white">
                    {totalProducts}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Delivery</span>

                  <span className="font-bold text-emerald-400">
                    Email Delivery
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t border-white/10 pt-6">
                {discountAmount > 0 && (
                  <div className="mb-4 flex items-center justify-between text-sm text-emerald-300">
                    <span>Your product discounts</span>
                    <span className="font-bold">-${discountAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    Total amount
                  </span>

                  <span className="text-3xl font-black text-cyan-400">
                    ${payableTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={proceedToCheckout}
                disabled={isCheckingOut}
                className="mt-6 w-full rounded-xl bg-cyan-400 px-6 py-4 font-black text-slate-950 transition hover:bg-cyan-300"
              >
                {isCheckingOut ? "Checking stock..." : "Proceed to Checkout"}
              </button>

              <Link
                href="/"
                className="mt-3 block w-full rounded-xl border border-white/15 px-6 py-4 text-center font-bold transition hover:border-cyan-400"
              >
                Continue Shopping
              </Link>

              <p className="mt-5 text-center text-xs leading-5 text-slate-500">
                Product codes will be delivered to the
                email address entered for each product
                after successful payment.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
