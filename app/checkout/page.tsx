"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import PaymentMethodsBanner from "../../components/PaymentMethodsBanner";
import { useStorePreferences } from "../../components/StorePreferences";

type CartItem = {
  id: string;
  productId?: string;
  productOptionId?: string;
  slug?: string;
  name: string;
  title?: string;
  image?: string;
  editionName?: string;
  denomination?: number | string;
  customValue?: number;
  price: number;
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number;
  isBulkOrder?: boolean;
  productType?: string;
  deliveryType?: string;
  email?: string;
  customerInformation?: Array<{ fieldId: string; label: string; value: string }>;
  categorySlug?: string;
  fulfillmentMode?: "PLAYER_ID_TOPUP" | "GAMING_VOUCHER";
  playerId?: string;
};

type RawCartItem = {
  id?: string;
  cartId?: string;
  productId?: string;
  productOptionId?: string;
  slug?: string;
  categorySlug?: string;
  name?: string;
  title?: string;
  productName?: string;
  image?: string;
  editionName?: string;
  denomination?: number | string;
  amount?: number | string;
  customValue?: number | string;
  price?: number | string;
  unitPrice?: number | string;
  totalPrice?: number | string;
  quantity?: number | string;
  minQuantity?: number;
  maxQuantity?: number;
  isBulkOrder?: boolean;
  productType?: string;
  deliveryType?: string;
  email?: string;
  customerInformation?: Array<{ fieldId?: unknown; label?: unknown; value?: unknown }>;
  fulfillmentMode?: string;
  playerId?: string;
};

function normalizeCartItem(
  item: RawCartItem,
  index: number
): CartItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const quantity = Math.max(1, Number(item.quantity || 1));
  const unitPrice = Number(
    item.unitPrice ??
      item.price ??
      (item.totalPrice
        ? Number(item.totalPrice) / quantity
        : 0)
  );

  const customValue =
    item.customValue === undefined ||
    item.customValue === null ||
    item.customValue === ""
      ? undefined
      : Number(item.customValue);

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null;
  }

  if (
    customValue !== undefined &&
    (!Number.isFinite(customValue) || customValue <= 0)
  ) {
    return null;
  }

  const id = String(
    item.id ||
      item.cartId ||
      item.productId ||
      item.slug ||
      item.categorySlug ||
      `checkout-item-${index}`
  );

  const name =
    item.name ||
    item.title ||
    item.productName ||
    "Digital Product";

  return {
    id,
    productId: item.productId,
    productOptionId: item.productOptionId,
    slug: item.slug || item.categorySlug,
    categorySlug: item.categorySlug,
    name,
    title: item.title || item.productName,
    image: item.image,
    editionName: item.editionName,
    denomination: item.denomination ?? item.amount,
    customValue,
    price: unitPrice,
    quantity,
    minQuantity: item.minQuantity ?? 1,
    maxQuantity: Boolean(item.isBulkOrder)
      ? undefined
      : item.maxQuantity ?? 10,
    isBulkOrder: Boolean(item.isBulkOrder),
    productType: item.productType || "digital",
    deliveryType: item.deliveryType || "digital",
    email: item.email,
    customerInformation: Array.isArray(item.customerInformation)
      ? item.customerInformation
          .map((field) => ({
            fieldId: String(field.fieldId ?? ""),
            label: String(field.label ?? ""),
            value: String(field.value ?? "").trim(),
          }))
          .filter((field) => field.fieldId && field.value)
      : [],
    fulfillmentMode:
      item.fulfillmentMode === "PLAYER_ID_TOPUP" ||
      item.fulfillmentMode === "GAMING_VOUCHER"
        ? item.fulfillmentMode
        : undefined,
    playerId:
      typeof item.playerId === "string"
        ? item.playerId.trim()
        : undefined,
  };
}

type CheckoutForm = {
  email: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
  orderNote: string;
};

type WalletDetails = {
  authenticated: boolean;
  balance: number;
  currency: string;
  loading: boolean;
};

type CustomerDiscountDetails = {
  authenticated: boolean;
  email: string | null;
  discounts: Record<string, number>;
  loading: boolean;
};

type PaymentRestrictions = {
  allowedPaymentMethods: string[];
  allowedUsdtNetworks: string[];
  loading: boolean;
};

const PAYMENT_METHOD_IDS: Record<string, string> = {
  wallet: "WALLET",
  binance: "BINANCE_PAY",
  usdt: "USDT_DIRECT",
  pally: "PALLY",
  freekassa: "FREEKASSA",
};

const PAYMENT_METHOD_ORDER = ["wallet", "binance", "usdt", "pally", "freekassa"];

const initialForm: CheckoutForm = {
  email: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  pinCode: "",
  orderNote: "",
};

function isPhysicalProduct(item: CartItem) {
  return (
    item.productType === "physical" ||
    item.deliveryType === "home-delivery" ||
    item.deliveryType === "physical"
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { formatPrice } = useStorePreferences();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutSource, setCheckoutSource] = useState<
    "buyNowItem" | "cart"
  >("cart");
  const [form, setForm] = useState<CheckoutForm>(initialForm);
  const [paymentMethod, setPaymentMethod] = useState("binance");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBulkPaymentConfirmation, setShowBulkPaymentConfirmation] = useState(false);
  const bulkPaymentConfirmed = useRef(false);
  const [wallet, setWallet] = useState<WalletDetails>({
    authenticated: false,
    balance: 0,
    currency: "USD",
    loading: true,
  });
  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscountDetails>({
    authenticated: false,
    email: null,
    discounts: {},
    loading: true,
  });
  const [paymentFee, setPaymentFee] = useState(0);
  const [paymentRestrictions, setPaymentRestrictions] = useState<PaymentRestrictions>({
    allowedPaymentMethods: [],
    allowedUsdtNetworks: [],
    loading: true,
  });

  useEffect(() => {
    try {
      const buyNowKeys = [
        "buyNowItem",
        "buyNowProduct",
        "checkoutBuyNow",
      ];

      const cartKeys = [
        "checkoutCart",
        "shoppingCart",
        "cart",
        "cartItems",
      ];

      let rawItems: RawCartItem[] = [];
      let source: "buyNowItem" | "cart" = "cart";

      for (const key of buyNowKeys) {
        const raw = localStorage.getItem(key);

        if (!raw) {
          continue;
        }

        try {
          const parsed = JSON.parse(raw) as
            | RawCartItem
            | RawCartItem[];

          const candidates = Array.isArray(parsed)
            ? parsed
            : [parsed];

          const normalized = candidates
            .map(normalizeCartItem)
            .filter(
              (item): item is CartItem => item !== null
            );

          if (normalized.length > 0) {
            setCheckoutSource("buyNowItem");
            setCartItems(normalized);
            setIsLoaded(true);
            return;
          }
        } catch {
          localStorage.removeItem(key);
        }
      }

      for (const key of cartKeys) {
        const raw = localStorage.getItem(key);

        if (!raw) {
          continue;
        }

        try {
          const parsed = JSON.parse(raw) as RawCartItem[];

          if (!Array.isArray(parsed)) {
            continue;
          }

          rawItems = parsed;

          const normalized = rawItems
            .map(normalizeCartItem)
            .filter(
              (item): item is CartItem => item !== null
            );

          if (normalized.length > 0) {
            source = "cart";
            setCheckoutSource(source);
            setCartItems(normalized);
            setIsLoaded(true);
            return;
          }
        } catch {
          // Try the next supported storage key.
        }
      }

      setCheckoutSource(source);
      setCartItems([]);
    } catch {
      setCartItems([]);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || cartItems.length === 0) return;
    const productIds = [...new Set(cartItems.map((item) => item.productId).filter(Boolean))] as string[];

    if (productIds.length === 0) {
      setPaymentRestrictions({ allowedPaymentMethods: [], allowedUsdtNetworks: [], loading: false });
      setMessage("Unable to identify the products in your cart. Please add them again.");
      return;
    }

    const controller = new AbortController();
    async function loadPaymentRestrictions() {
      try {
        const response = await fetch("/api/products/payment-restrictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds }),
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          allowedPaymentMethods?: string[];
          allowedUsdtNetworks?: string[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Unable to load payment methods.");

        const next: PaymentRestrictions = {
          allowedPaymentMethods: result.allowedPaymentMethods ?? [],
          allowedUsdtNetworks: result.allowedUsdtNetworks ?? [],
          loading: false,
        };
        setPaymentRestrictions(next);
        setPaymentMethod((current) => {
          if (next.allowedPaymentMethods.includes(PAYMENT_METHOD_IDS[current])) return current;
          return PAYMENT_METHOD_ORDER.find((method) =>
            next.allowedPaymentMethods.includes(PAYMENT_METHOD_IDS[method]),
          ) ?? "";
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPaymentRestrictions({ allowedPaymentMethods: [], allowedUsdtNetworks: [], loading: false });
        setMessage(error instanceof Error ? error.message : "Unable to load payment methods.");
      }
    }

    void loadPaymentRestrictions();
    return () => controller.abort();
  }, [cartItems, isLoaded]);

  function paymentAllowed(method: string) {
    return paymentRestrictions.allowedPaymentMethods.includes(PAYMENT_METHOD_IDS[method]);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerDiscounts() {
      try {
        const response = await fetch("/api/customer-discounts", { cache: "no-store" });
        const result = (await response.json()) as {
          authenticated?: boolean;
          email?: string | null;
          discounts?: Record<string, number>;
        };

        if (!cancelled && response.ok) {
          setCustomerDiscounts({
            authenticated: Boolean(result.authenticated),
            email: result.email ?? null,
            discounts: result.discounts ?? {},
            loading: false,
          });
          if (result.authenticated) {
            setForm((current) => ({
              ...current,
              email: current.email || result.email || "",
            }));
          }
        }
      } catch {
        // Standard prices remain available when discount lookup is unavailable.
      } finally {
        if (!cancelled) {
          setCustomerDiscounts((current) => ({ ...current, loading: false }));
        }
      }
    }

    void loadCustomerDiscounts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      try {
        const response = await fetch("/api/wallet/balance", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          authenticated?: boolean;
          balance?: number;
          currency?: string;
        };

        if (!cancelled && response.ok) {
          setWallet({
            authenticated: Boolean(result.authenticated),
            balance: Number(result.balance ?? 0),
            currency: result.currency ?? "USD",
            loading: false,
          });
        }
      } catch {
        // Wallet remains unavailable while other payment methods continue.
      } finally {
        if (!cancelled) {
          setWallet((current) => ({
            ...current,
            loading: false,
          }));
        }
      }
    }

    void loadWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  const requiresShipping = useMemo(() => {
    return cartItems.some(isPhysicalProduct);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      return total + Number(item.price) * Number(item.quantity || 1);
    }, 0);
  }, [cartItems]);

  const customerDiscountAmount = useMemo(() => {
    const emailMatches =
      Boolean(customerDiscounts.email) &&
      form.email.trim().toLowerCase() === customerDiscounts.email?.toLowerCase();

    if (!emailMatches) return 0;

    return cartItems.reduce((total, item) => {
      const percent = item.productId
        ? Number(customerDiscounts.discounts[item.productId] ?? 0)
        : 0;
      return total + Number(item.price) * Number(item.quantity || 1) * percent / 100;
    }, 0);
  }, [cartItems, customerDiscounts.discounts, customerDiscounts.email, form.email]);

  const shippingCharge = useMemo(() => {
    if (!requiresShipping || subtotal === 0) {
      return 0;
    }

    return subtotal >= 999 ? 0 : 79;
  }, [requiresShipping, subtotal]);

  const baseTotalAmount = Math.max(
    0,
    subtotal - customerDiscountAmount + shippingCharge,
  );
  const totalAmount = Number((baseTotalAmount + paymentFee).toFixed(2));

  useEffect(() => {
    const controller = new AbortController();

    async function loadPaymentFee() {
      try {
        const query = new URLSearchParams({
          paymentMethod,
          baseTotal: baseTotalAmount.toFixed(2),
        });
        const response = await fetch(`/api/orders?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as { fee?: number };

        if (response.ok) {
          setPaymentFee(Math.max(0, Number(result.fee) || 0));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPaymentFee(0);
        }
      }
    }

    void loadPaymentFee();

    return () => controller.abort();
  }, [baseTotalAmount, paymentMethod]);

  function updateField(
    field: keyof CheckoutForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateQuantity(itemId: string, requestedQuantity: number) {
    setMessage("");

    setCartItems((currentItems) => {
      let quantityMessage = "";

      const updatedItems = currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const minimum = item.minQuantity ?? 1;
        const maximum = item.isBulkOrder
          ? Number.MAX_SAFE_INTEGER
          : item.maxQuantity ?? 10;
        const productName = item.name || item.title || "this product";

        if (!item.isBulkOrder && requestedQuantity > maximum) {
          quantityMessage = `Maximum allowed quantity for ${productName} is ${maximum}.`;
        }

        if (requestedQuantity < minimum) {
          quantityMessage = `Minimum allowed quantity for ${productName} is ${minimum}.`;
        }

        return {
          ...item,
          quantity: Math.min(
            maximum,
            Math.max(minimum, requestedQuantity)
          ),
        };
      });

      try {
        if (checkoutSource === "buyNowItem") {
          localStorage.setItem(
            "buyNowItem",
            JSON.stringify(updatedItems[0])
          );
        } else {
          const shoppingCartItems = updatedItems.map((item) => ({
            cartId: item.id,
            productId: item.productId,
            productOptionId: item.productOptionId,
            slug: item.slug,
            categorySlug:
              item.categorySlug || item.slug || "",
            productName: item.name || item.title || "Product",
            amount: Number(item.denomination || 0),
            customValue: item.customValue,
            quantity: item.quantity,
            email: item.email || "",
            customerInformation: item.customerInformation ?? [],
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
            minQuantity: item.minQuantity,
            maxQuantity: item.maxQuantity,
            isBulkOrder: item.isBulkOrder,
          }));

          localStorage.setItem(
            "checkoutCart",
            JSON.stringify(shoppingCartItems)
          );
          localStorage.setItem(
            "shoppingCart",
            JSON.stringify(shoppingCartItems)
          );

          window.dispatchEvent(new Event("cartUpdated"));
        }
      } catch {
        quantityMessage = "Unable to save the updated quantity.";
      }

      if (quantityMessage) {
        setMessage(quantityMessage);
      }

      return updatedItems;
    });
  }

  function clearCart() {
    const confirmed = window.confirm(
      "Are you sure you want to clear the entire cart?"
    );

    if (!confirmed) {
      return;
    }

    try {
      [
        "shoppingCart",
        "checkoutCart",
        "cart",
        "cartItems",
        "buyNowItem",
        "buyNowProduct",
        "checkoutBuyNow",
        "pendingOrder",
      ].forEach((key) => localStorage.removeItem(key));

      setCartItems([]);
      setMessage("");
      setTermsAccepted(false);

      window.dispatchEvent(new Event("cartUpdated"));
    } catch {
      setMessage("Unable to clear the cart. Please try again.");
    }
  }

  function validateForm() {
    if (!form.email.trim()) {
      return "Please enter your email address.";
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }

    if (requiresShipping) {
      if (!form.addressLine1.trim()) {
        return "Please enter your delivery address.";
      }

      if (!form.city.trim()) {
        return "Please enter your city.";
      }

      if (!form.state.trim()) {
        return "Please select your state.";
      }

      if (!/^\d{6}$/.test(form.pinCode.trim())) {
        return "Please enter a valid 6-digit PIN code.";
      }
    }

    if (!paymentMethod) {
      return "Please select a payment method.";
    }

    if (paymentRestrictions.loading) {
      return "Please wait while payment methods are loaded.";
    }

    if (!paymentAllowed(paymentMethod)) {
      return "This payment method is not available for the selected products.";
    }

    if (paymentMethod === "wallet" && !wallet.authenticated) {
      return "Sign in before paying with your wallet.";
    }

    if (
      paymentMethod === "wallet" &&
      wallet.balance < totalAmount
    ) {
      return "Your wallet balance is insufficient for this order.";
    }

    if (!termsAccepted) {
      return "Please accept the terms and conditions.";
    }

    return "";
  }

  async function handleSubmit(
  event: FormEvent<HTMLFormElement>
) {
  event.preventDefault();
  setMessage("");

  const validationError = validateForm();

  if (validationError) {
    setMessage(validationError);
    return;
  }

  if (cartItems.some((item) => item.isBulkOrder) && !bulkPaymentConfirmed.current) {
    setShowBulkPaymentConfirmation(true);
    return;
  }

  setIsSubmitting(true);

  try {
    const secureItems = cartItems.map((item) => ({
      productOptionId: item.productOptionId,

      categorySlug:
        item.categorySlug ?? item.slug ?? "",

      denomination: Number(
        item.denomination ?? 0
      ),

      customValue: item.customValue,

      fulfillmentMode: item.fulfillmentMode,

      playerId: item.playerId,

      customerInformation: item.customerInformation ?? [],

      quantity: Number(item.quantity),
    }));

    const response = await fetch("/api/orders", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        customer: {
          email: form.email.trim(),
          orderNote: form.orderNote.trim(),
          marketingConsent,
        },

        paymentMethod,
        items: secureItems,
      }),
    });

    const result = (await response.json()) as {
      order?: {
        id: string;
        orderNumber: string;
        subtotal: number | string;
        totalAmount: number | string;
        paymentMethod: string;
        status: string;
        createdAt: string;
        accessToken: string;
        walletBalanceAfter?: number | string | null;
      };

      error?: string;
    };

    if (!response.ok || !result.order) {
      throw new Error(
        result.error ??
          "Unable to create your order."
      );
    }

    const pendingOrder = {
      id: result.order.orderNumber,
      databaseId: result.order.id,
      orderNumber: result.order.orderNumber,
      accessToken: result.order.accessToken,

      customer: {
        fullName: "Customer",
        email: form.email.trim(),
        phone: "",
      },

      items: cartItems,

      paymentMethod,
      allowedUsdtNetworks: paymentRestrictions.allowedUsdtNetworks,

      subtotal: Number(
        result.order.subtotal
      ),

      shippingCharge: 0,

      totalAmount: Number(
        result.order.totalAmount
      ),

      deliveryMethod: "Digital Delivery",
      status: result.order.status,
      createdAt: result.order.createdAt,
    };

    localStorage.setItem(
      "pendingOrder",
      JSON.stringify(pendingOrder)
    );

    if (paymentMethod === "wallet") {
      localStorage.setItem(
        "latestOrder",
        JSON.stringify(pendingOrder),
      );

      [
        "shoppingCart",
        "checkoutCart",
        "cart",
        "cartItems",
        "buyNowItem",
        "buyNowProduct",
        "checkoutBuyNow",
      ].forEach((key) => localStorage.removeItem(key));

      window.dispatchEvent(new Event("cartUpdated"));
      router.push("/checkout/success");
      return;
    }

    router.push(paymentMethod === "usdt" ? "/checkout/usdt" : "/checkout/payment");
  } catch (error) {
    setMessage(
      error instanceof Error
        ? error.message
        : "Unable to continue. Please try again."
    );

    setIsSubmitting(false);
  }
}

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
        </div>
      </main>
    );
  }

  if (cartItems.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-10 text-center">
          <div className="text-5xl">🛒</div>

          <h1 className="mt-5 text-3xl font-black">
            Your checkout is empty
          </h1>

          <p className="mt-3 text-slate-400">
            Add a product to your cart before continuing to checkout.
          </p>

          <Link
            href="/"
            className="mt-7 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300"
          >
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Checkout header */}
      <section className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-5 sm:py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
              Secure Checkout
            </p>

            <h1 className="mt-1 text-2xl font-black">
              Complete Your Order
            </h1>
          </div>

          <div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">
            <span>🔒</span>
            <span>Secure order processing</span>
          </div>
        </div>
      </section>

      {/* Checkout steps */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3 overflow-x-auto text-sm">
            <div className="flex shrink-0 items-center gap-2 font-semibold text-cyan-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-slate-950">
                1
              </span>
              Details
            </div>

            <div className="h-px min-w-8 flex-1 bg-white/10" />

            <div className="flex shrink-0 items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs">
                2
              </span>
              Payment
            </div>

            <div className="h-px min-w-8 flex-1 bg-white/10" />

            <div className="flex shrink-0 items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs">
                3
              </span>
              Confirmation
            </div>
          </div>
        </div>
      </section>

      <form
        id="checkout-form"
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-7xl gap-4 px-3 py-5 sm:gap-7 sm:px-5 sm:py-8 lg:grid-cols-[minmax(0,1fr)_420px]"
      >
        {/* Customer information */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-xl">
                👤
              </span>

              <div>
                <h2 className="text-xl font-black">
                  Contact Information
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Used for order updates and delivery communication.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-200"
                >
                  Email Address
                  <span className="ml-1 text-red-400">*</span>
                </label>

                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    updateField("email", event.target.value)
                  }
                  placeholder="customer@example.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                />
              </div>

            </div>
          </section>

          {/* Shipping address */}
          {requiresShipping && (
            <section className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-xl">
                  🚚
                </span>

                <div>
                  <h2 className="text-xl font-black">
                    Delivery Address
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Enter the address where you want to receive the
                    product.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="addressLine1"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    House, Building and Street
                    <span className="ml-1 text-red-400">*</span>
                  </label>

                  <input
                    id="addressLine1"
                    type="text"
                    value={form.addressLine1}
                    onChange={(event) =>
                      updateField(
                        "addressLine1",
                        event.target.value
                      )
                    }
                    placeholder="House number, building and street"
                    autoComplete="address-line1"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="addressLine2"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    Area, Colony or Locality
                  </label>

                  <input
                    id="addressLine2"
                    type="text"
                    value={form.addressLine2}
                    onChange={(event) =>
                      updateField(
                        "addressLine2",
                        event.target.value
                      )
                    }
                    placeholder="Area, colony or locality"
                    autoComplete="address-line2"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="landmark"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    Landmark
                  </label>

                  <input
                    id="landmark"
                    type="text"
                    value={form.landmark}
                    onChange={(event) =>
                      updateField("landmark", event.target.value)
                    }
                    placeholder="Nearby landmark"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    City
                    <span className="ml-1 text-red-400">*</span>
                  </label>

                  <input
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(event) =>
                      updateField("city", event.target.value)
                    }
                    placeholder="Enter city"
                    autoComplete="address-level2"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="state"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    State
                    <span className="ml-1 text-red-400">*</span>
                  </label>

                  <select
                    id="state"
                    value={form.state}
                    onChange={(event) =>
                      updateField("state", event.target.value)
                    }
                    autoComplete="address-level1"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  >
                    <option value="">Select state</option>
                    <option value="Andhra Pradesh">
                      Andhra Pradesh
                    </option>
                    <option value="Assam">Assam</option>
                    <option value="Bihar">Bihar</option>
                    <option value="Chhattisgarh">
                      Chhattisgarh
                    </option>
                    <option value="Delhi">Delhi</option>
                    <option value="Goa">Goa</option>
                    <option value="Gujarat">Gujarat</option>
                    <option value="Haryana">Haryana</option>
                    <option value="Himachal Pradesh">
                      Himachal Pradesh
                    </option>
                    <option value="Jharkhand">Jharkhand</option>
                    <option value="Karnataka">Karnataka</option>
                    <option value="Kerala">Kerala</option>
                    <option value="Madhya Pradesh">
                      Madhya Pradesh
                    </option>
                    <option value="Maharashtra">
                      Maharashtra
                    </option>
                    <option value="Odisha">Odisha</option>
                    <option value="Punjab">Punjab</option>
                    <option value="Rajasthan">Rajasthan</option>
                    <option value="Tamil Nadu">
                      Tamil Nadu
                    </option>
                    <option value="Telangana">Telangana</option>
                    <option value="Uttar Pradesh">
                      Uttar Pradesh
                    </option>
                    <option value="Uttarakhand">
                      Uttarakhand
                    </option>
                    <option value="West Bengal">
                      West Bengal
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="pinCode"
                    className="mb-2 block text-sm font-semibold text-slate-200"
                  >
                    PIN Code
                    <span className="ml-1 text-red-400">*</span>
                  </label>

                  <input
                    id="pinCode"
                    type="text"
                    inputMode="numeric"
                    value={form.pinCode}
                    onChange={(event) =>
                      updateField(
                        "pinCode",
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6)
                      )
                    }
                    placeholder="6-digit PIN code"
                    autoComplete="postal-code"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Delivery method */}
          <section className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-xl">
                📦
              </span>

              <div>
                <h2 className="text-xl font-black">
                  Delivery Method
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Your available delivery option.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border-2 border-cyan-400 bg-cyan-400/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full border-4 border-cyan-400" />

                  <div>
                    <p className="font-bold">
                      {requiresShipping
                        ? "Standard Home Delivery"
                        : "Digital Email Delivery"}
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      {requiresShipping
                        ? "Estimated delivery within 3–7 business days."
                        : "Delivery instructions will be sent to your email."}
                    </p>
                  </div>
                </div>

                <p className="shrink-0 font-bold text-green-400">
                  {shippingCharge === 0
                    ? "FREE"
                    : formatPrice(shippingCharge)}
                </p>
              </div>
            </div>
          </section>

          {/* Payment method */}
          <section className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-xl">
                💳
              </span>

              <div>
                <h2 className="text-xl font-black">
                  Payment Method
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Select how you want to pay.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
              <label
                className={`col-span-2 rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "wallet"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950"
                } ${
                  !wallet.authenticated || wallet.balance < totalAmount
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:border-white/20"
                } ${!paymentAllowed("wallet") ? "hidden" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="wallet"
                  checked={paymentMethod === "wallet"}
                  disabled={
                    wallet.loading ||
                    !wallet.authenticated ||
                    wallet.balance < totalAmount
                  }
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-xl font-black text-cyan-400">
                      $
                    </span>

                    <div>
                      <p className="font-bold">InGamePin Wallet</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {wallet.loading
                          ? "Checking wallet balance..."
                          : wallet.authenticated
                            ? wallet.balance >= totalAmount
                              ? "Instant secure payment"
                              : "Insufficient wallet balance"
                            : "Sign in to use your wallet"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">Balance</p>
                    <p className="mt-1 font-black text-cyan-400">
                      {wallet.authenticated
                        ? formatPrice(wallet.balance)
                        : "—"}
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "upi"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950 hover:border-white/20 hidden"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="upi"
                  checked={paymentMethod === "upi"}
                  disabled
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center gap-3">
                  <span className="text-2xl">📱</span>

                  <div>
                    <p className="font-bold">UPI</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pay using any UPI app
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "binance"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950 hover:border-white/20"
                } ${!paymentAllowed("binance") ? "hidden" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="binance"
                  checked={paymentMethod === "binance"}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-400 text-sm font-black text-slate-950">
                    B
                  </span>

                  <div>
                    <p className="font-bold">Binance Pay</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pay securely with Binance
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "usdt"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950 hover:border-white/20"
                } ${!paymentAllowed("usdt") ? "hidden" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="usdt"
                  checked={paymentMethod === "usdt"}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-sm font-black text-white">
                    T</span>

                  <div>
                    <p className="font-bold">Direct USDT</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pay with USDT on TRC20, BEP20, or Solana
                    </p>
                  </div>
                </div>
              </label>
              <label
                className={`cursor-pointer rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "pally"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950 hover:border-white/20"
                } ${!paymentAllowed("pally") ? "hidden" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="pally"
                  checked={paymentMethod === "pally"}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500 text-sm font-black text-white">
                    P
                  </span>

                  <div>
                    <p className="font-bold">Pally Payment</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Faster Payments System or USDT
                    </p>
                  </div>
                </div>
              </label>              <label
                className={`cursor-pointer rounded-xl border p-3 transition sm:p-4 ${
                  paymentMethod === "freekassa"
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 bg-slate-950 hover:border-white/20"
                } ${!paymentAllowed("freekassa") ? "hidden" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="freekassa"
                  checked={paymentMethod === "freekassa"}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="sr-only"
                />

                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500 text-sm font-black text-white">
                    F
                  </span>

                  <div>
                    <p className="font-bold">FreeKassa</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Cards, SBP and supported payment methods
                    </p>
                  </div>
                </div>
              </label>
            </div>

            {!paymentRestrictions.loading && paymentRestrictions.allowedPaymentMethods.length === 0 && (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                No common payment method is available for the products in this cart.
              </p>
            )}

            <PaymentMethodsBanner className="mt-4 sm:mt-5" />
          </section>

          {/* Order note */}
          <section className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-7">
            <label
              htmlFor="orderNote"
              className="block text-lg font-black"
            >
              Order Note
            </label>

            <p className="mt-1 text-sm text-slate-400">
              Add optional delivery instructions.
            </p>

            <textarea
              id="orderNote"
              value={form.orderNote}
              onChange={(event) =>
                updateField("orderNote", event.target.value)
              }
              rows={3}
              placeholder="Example: Please call before delivery"
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
            />
          </section>
        </div>

        {/* Order summary */}
        <aside>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-5 lg:sticky lg:top-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">
                Order Summary
              </h2>

              <div className="flex items-center gap-3">
                <Link
                  href="/cart"
                  className="text-sm font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Edit Cart
                </Link>

                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-400/20"
                >
                  Clear Cart
                </button>
              </div>
            </div>

            <div className="mt-5 max-h-80 space-y-4 overflow-y-auto pr-1">
              {cartItems.map((item) => (
            <div
                  key={item.id}
                  className="flex gap-4 border-b border-white/10 pb-4"
                >
                  <div className="flex h-20 w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name || item.title || "Product"}
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <span className="text-3xl">🎮</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-bold">
                      {item.name || item.title}
                    </h3>

                    {item.editionName && (
                      <p className="mt-1 text-xs text-slate-400">
                        Edition: {item.editionName}
                      </p>
                    )}

                    {item.denomination && (
                      <p className="mt-1 text-xs text-slate-400">
                        Value: ₹{item.denomination}
                      </p>
                    )}

                    {item.productId &&
                      form.email.trim().toLowerCase() === customerDiscounts.email?.toLowerCase() &&
                      Number(customerDiscounts.discounts[item.productId] ?? 0) > 0 && (
                      <p className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                        {customerDiscounts.discounts[item.productId]}% customer discount
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="mb-1.5 text-xs text-slate-500">
                          Quantity
                        </p>

                        <div className="inline-flex items-center overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                Number(item.quantity || 1) - 1
                              )
                            }
                            disabled={
                              Number(item.quantity || 1) <=
                              (item.minQuantity ?? 1)
                            }
                            aria-label={`Reduce quantity of ${
                              item.name || item.title || "product"
                            }`}
                            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-300 transition hover:bg-white/10 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            −
                          </button>

                          <input
                            type="number"
                            inputMode="numeric"
                            min={item.minQuantity ?? 1}
                            max={
                              item.isBulkOrder
                                ? undefined
                                : item.maxQuantity ?? 10
                            }
                            step={1}
                            value={item.quantity || 1}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => {
                              const requested = event.currentTarget.valueAsNumber;
                              if (Number.isSafeInteger(requested)) {
                                updateQuantity(item.id, requested);
                              }
                            }}
                            aria-label={`Enter quantity of ${item.name || item.title || "product"}`}
                            className="h-9 w-16 border-x border-white/10 bg-slate-950 px-2 text-center text-sm font-black text-white outline-none focus:bg-slate-900"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                Number(item.quantity || 1) + 1
                              )
                            }
                            disabled={
                              !item.isBulkOrder &&
                              Number(item.quantity || 1) >=
                                (item.maxQuantity ?? 10)
                            }
                            aria-label={`Increase quantity of ${
                              item.name || item.title || "product"
                            }`}
                            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-300 transition hover:bg-white/10 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>

                        <p className="mt-1.5 text-[10px] text-slate-600">
                          {item.isBulkOrder
                            ? "No quantity limit"
                            : `Limit: ${item.minQuantity ?? 1}–${item.maxQuantity ?? 10}`}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-slate-500">
                          Item total
                        </p>

                        <p className="mt-1 font-bold">
                          {formatPrice(
                            Number(item.price) *
                              Number(item.quantity || 1)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="text-white">
                  {formatPrice(subtotal)}
                </span>
              </div>

              {customerDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Your product discounts</span>
                  <span className="font-bold">-{formatPrice(customerDiscountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-400">
                <span>Delivery</span>

                <span
                  className={
                    shippingCharge === 0
                      ? "font-semibold text-green-400"
                      : "text-white"
                  }
                >
                  {shippingCharge === 0
                    ? "FREE"
                    : formatPrice(shippingCharge)}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Taxes</span>
                <span className="text-white">
                  Included
                </span>
              </div>

              {paymentFee > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Payment gateway fee</span>
                  <span className="font-bold text-white">
                    {formatPrice(paymentFee)}
                  </span>
                </div>
              )}
            </div>

            <div className="my-5 border-t border-white/10" />

            <div className="flex items-end justify-between">
              <div>
                <p className="font-bold">Total Amount</p>
                <p className="mt-1 text-xs text-slate-500">
                  Inclusive of applicable taxes
                </p>
              </div>

              <p className="text-2xl font-black text-cyan-400">
                {formatPrice(totalAmount)}
              </p>
            </div>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-950 p-4">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) =>
                  setTermsAccepted(event.target.checked)
                }
                className="mt-1 h-4 w-4 shrink-0 rounded"
              />

              <span className="text-xs leading-5 text-slate-400">
                I agree to the terms, privacy policy and applicable
                return or replacement policy.
              </span>
            </label>

            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950 p-4">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(event) => setMarketingConsent(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded"
              />
              <span className="text-xs leading-5 text-slate-400">
                Email me about product restocks, promotions and special offers.
                I can unsubscribe at any time.
              </span>
            </label>

            {message && (
              <p
                aria-live="polite"
                className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-4 text-base font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Processing..."
                : `Continue to Payment • ${formatPrice(
                    totalAmount
                  )}`}
            </button>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span>🔒</span>
              <span>Your information is securely processed</span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                Secure
              </div>

              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                Genuine
              </div>

              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                Support
              </div>
            </div>
          </div>
        </aside>
      </form>
      {showBulkPaymentConfirmation && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-payment-confirmation-title">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/40 bg-slate-900 p-6 text-white shadow-2xl">
            <h2 id="bulk-payment-confirmation-title" className="text-xl font-black text-amber-200">Digital delivery information</h2>
            <p className="mt-3 text-sm font-bold text-slate-200">Digital Delivery Time: 1-15 Working Days</p>
            <p className="mt-3 text-sm text-slate-400">Your cart contains a digital delivery product. Confirm before continuing to payment.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShowBulkPaymentConfirmation(false)} className="rounded-xl border border-white/15 px-4 py-3 font-black">Cancel</button>
              <button type="button" onClick={() => { bulkPaymentConfirmed.current = true; setShowBulkPaymentConfirmation(false); (document.getElementById("checkout-form") as HTMLFormElement | null)?.requestSubmit(); }} className="rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950">Continue to payment</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
