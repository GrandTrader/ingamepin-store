"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CartItem = {
  cartId: string;
  productId?: string;
  categorySlug: string;
  productName: string;
  amount: number;
  quantity: number;
  email: string;
  unitPrice: number;
  totalPrice: number;
};

const MAXIMUM_QUANTITY = 10;

export default function CartPage() {
  const router = useRouter();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [customerDiscounts, setCustomerDiscounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadCart();
  }, []);

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

      setCartItems(safeCart);
    } catch {
      setCartItems([]);
    } finally {
      setIsLoaded(true);
    }
  }

  function saveCart(updatedCart: CartItem[]) {
    setCartItems(updatedCart);

    localStorage.setItem(
      "shoppingCart",
      JSON.stringify(updatedCart)
    );

    window.dispatchEvent(new Event("cartUpdated"));
  }

  function decreaseQuantity(cartId: string) {
    const updatedCart = cartItems.map((item) => {
      if (item.cartId !== cartId) {
        return item;
      }

      const newQuantity =
        item.quantity > 1 ? item.quantity - 1 : 1;

      return {
        ...item,
        quantity: newQuantity,
        totalPrice: item.unitPrice * newQuantity,
      };
    });

    saveCart(updatedCart);
  }

  function increaseQuantity(cartId: string) {
    const updatedCart = cartItems.map((item) => {
      if (item.cartId !== cartId) {
        return item;
      }

      const newQuantity =
        item.quantity < MAXIMUM_QUANTITY
          ? item.quantity + 1
          : item.quantity;

      return {
        ...item,
        quantity: newQuantity,
        totalPrice: item.unitPrice * newQuantity,
      };
    });

    saveCart(updatedCart);
  }

  function removeItem(cartId: string) {
    const updatedCart = cartItems.filter(
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

  function proceedToCheckout() {
    if (cartItems.length === 0) {
      return;
    }

    localStorage.setItem(
      "checkoutCart",
      JSON.stringify(cartItems)
    );

    localStorage.removeItem("buyNowItem");

    router.push("/checkout");
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

                          <p className="mt-1 break-all text-sm text-slate-400">
                            Delivery email:{" "}
                            <span className="text-white">
                              {item.email}
                            </span>
                          </p>
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
                                decreaseQuantity(
                                  item.cartId
                                )
                              }
                              disabled={item.quantity <= 1}
                              aria-label="Decrease quantity"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-950 text-xl font-bold transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              −
                            </button>

                            <div className="flex h-10 min-w-16 items-center justify-center rounded-lg border border-white/15 bg-slate-950 px-4 font-black">
                              {item.quantity}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                increaseQuantity(
                                  item.cartId
                                )
                              }
                              disabled={
                                item.quantity >=
                                MAXIMUM_QUANTITY
                              }
                              aria-label="Increase quantity"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-950 text-xl font-bold transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>

                          <p className="mt-2 text-xs text-slate-500">
                            Maximum 10 per product
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">
                            Product total
                          </p>

                          <p className="mt-1 text-2xl font-black text-cyan-400">
                            ₹
                            {(
                              item.unitPrice *
                              item.quantity *
                              (1 - Number(item.productId ? customerDiscounts[item.productId] ?? 0 : 0) / 100)
                            ).toLocaleString("en-IN")}
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
                    <span className="font-bold">-₹{discountAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    Total amount
                  </span>

                  <span className="text-3xl font-black text-cyan-400">
                    ₹{payableTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={proceedToCheckout}
                className="mt-6 w-full rounded-xl bg-cyan-400 px-6 py-4 font-black text-slate-950 transition hover:bg-cyan-300"
              >
                Proceed to Checkout
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
