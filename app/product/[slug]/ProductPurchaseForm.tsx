"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  optionName: string;
  platform: string | null;
  denomination: number | null;
  sellingPrice: number;
  stockQuantity: number;
  isCustomValue: boolean;
};

type FulfillmentMode =
  | "PLAYER_ID_TOPUP"
  | "GAMING_VOUCHER";

type ValueMode = "FIXED" | "CUSTOM";

type ProductPurchaseFormProps = {
  product: {
    id: string;
    slug: string;
    categorySlug: string;
    name: string;
    imageUrl: string | null;
    currency: string;
    productType: string;
    deliveryType: string;
    allowsFixedValues: boolean;
    allowsCustomValue: boolean;
    minimumCustomValue: number | null;
    maximumCustomValue: number | null;
    allowsPlayerIdTopup: boolean;
    allowsGamingVoucher: boolean;
    playerIdLabel: string | null;
    customerDiscountPercent: number;
  };
  options: ProductOption[];
};

type StoredCartItem = {
  id: string;
  cartId: string;
  productId: string;
  productOptionId: string;
  slug: string;
  categorySlug: string;
  name: string;
  title: string;
  productName: string;
  editionName: string;
  denomination: number | string;
  amount: number;
  customValue?: number;
  fulfillmentMode?: FulfillmentMode;
  playerId?: string;
  image?: string;
  price: number;
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  productType: string;
  deliveryType: string;
  email: string;
};

export default function ProductPurchaseForm({
  product,
  options,
}: ProductPurchaseFormProps) {
  const router = useRouter();
  const isGiftCard = product.productType === "GIFT_CARD";
  const isGamingTopup = product.productType === "GAME_TOPUP";

  const fixedOptions = useMemo(
    () => options.filter((option) => !option.isCustomValue),
    [options],
  );

  const customOption = useMemo(
    () => options.find((option) => option.isCustomValue),
    [options],
  );

  const firstAvailableFixedOption =
    fixedOptions.find(
      (option) =>
        option.stockQuantity > 0 &&
        option.optionName
          .toLowerCase()
          .includes("standard"),
    ) ??
    fixedOptions.find(
      (option) => option.stockQuantity > 0,
    ) ??
    fixedOptions[0];

  const initialValueMode: ValueMode =
    isGiftCard &&
    !product.allowsFixedValues &&
    product.allowsCustomValue
      ? "CUSTOM"
      : "FIXED";

  const initialFulfillmentMode: FulfillmentMode =
    product.allowsGamingVoucher
      ? "GAMING_VOUCHER"
      : "PLAYER_ID_TOPUP";

  const [valueMode, setValueMode] =
    useState<ValueMode>(initialValueMode);

  const [fulfillmentMode, setFulfillmentMode] =
    useState<FulfillmentMode>(initialFulfillmentMode);

  const [selectedOptionId, setSelectedOptionId] = useState(
    initialValueMode === "CUSTOM"
      ? customOption?.id ?? ""
      : firstAvailableFixedOption?.id ?? "",
  );

  const [customValue, setCustomValue] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const selectedFixedOption = useMemo(
    () =>
      fixedOptions.find(
        (option) => option.id === selectedOptionId,
      ),
    [fixedOptions, selectedOptionId],
  );

  const selectedOption =
    valueMode === "CUSTOM"
      ? customOption
      : selectedFixedOption;

  const parsedCustomValue = Number(customValue);

  const selectedUnitPrice =
    valueMode === "CUSTOM"
      ? Number.isFinite(parsedCustomValue)
        ? parsedCustomValue
        : 0
      : selectedFixedOption?.sellingPrice ?? 0;

  const requiresSingleQuantity =
    valueMode === "CUSTOM" ||
    (isGamingTopup && fulfillmentMode === "PLAYER_ID_TOPUP");

  const maximumQuantity = requiresSingleQuantity
    ? 1
    : Math.min(10, selectedFixedOption?.stockQuantity ?? 0);

  const totalPrice = selectedUnitPrice * quantity;
  const customerDiscountAmount =
    totalPrice * Math.max(0, product.customerDiscountPercent) / 100;
  const customerTotal = totalPrice - customerDiscountAmount;

  function formatPrice(value: number) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: product.currency,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function clearMessage() {
    setMessage("");
  }

  function changeValueMode(mode: ValueMode) {
    setValueMode(mode);
    setQuantity(1);
    clearMessage();

    if (mode === "CUSTOM") {
      setSelectedOptionId(customOption?.id ?? "");
    } else {
      setSelectedOptionId(firstAvailableFixedOption?.id ?? "");
    }
  }

  function changeFulfillmentMode(mode: FulfillmentMode) {
    setFulfillmentMode(mode);
    setQuantity(1);
    clearMessage();
  }

  function selectOption(optionId: string) {
    setSelectedOptionId(optionId);
    setQuantity(1);
    clearMessage();
  }

  function showError(text: string) {
    setMessageType("error");
    setMessage(text);
    return false;
  }

  function validateSelection() {
    if (!selectedOption) {
      return showError("Please select a product option.");
    }

    if (
      valueMode === "FIXED" &&
      selectedOption.stockQuantity < 1
    ) {
      return showError("The selected option is out of stock.");
    }

    if (valueMode === "CUSTOM") {
      if (!product.allowsCustomValue || !customOption) {
        return showError(
          "Custom value is not available for this product.",
        );
      }

      if (
        !Number.isFinite(parsedCustomValue) ||
        parsedCustomValue <= 0
      ) {
        return showError("Enter a valid custom value.");
      }

      if (
        product.minimumCustomValue !== null &&
        parsedCustomValue < product.minimumCustomValue
      ) {
        return showError(
          `Minimum custom value is ${formatPrice(
            product.minimumCustomValue,
          )}.`,
        );
      }

      if (
        product.maximumCustomValue !== null &&
        parsedCustomValue > product.maximumCustomValue
      ) {
        return showError(
          `Maximum custom value is ${formatPrice(
            product.maximumCustomValue,
          )}.`,
        );
      }
    }

    if (
      isGamingTopup &&
      fulfillmentMode === "PLAYER_ID_TOPUP"
    ) {
      const normalizedPlayerId = playerId.trim();

      if (
        !product.allowsPlayerIdTopup ||
        normalizedPlayerId.length < 3 ||
        normalizedPlayerId.length > 150
      ) {
        return showError(
          `Enter a valid ${product.playerIdLabel ?? "Player ID"}.`,
        );
      }
    }

    if (
      isGamingTopup &&
      fulfillmentMode === "GAMING_VOUCHER" &&
      !product.allowsGamingVoucher
    ) {
      return showError(
        "Gaming voucher delivery is not available.",
      );
    }

    if (quantity < 1 || quantity > maximumQuantity) {
      return showError("Please select a valid quantity.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return showError(
        "Please enter a valid delivery email address.",
      );
    }

    return true;
  }

  function createCartItem(): StoredCartItem {
    if (!selectedOption) {
      throw new Error("No product option selected.");
    }

    const selectedCustomValue =
      valueMode === "CUSTOM" ? parsedCustomValue : undefined;

    const editionName =
      valueMode === "CUSTOM"
        ? `Custom Value ${formatPrice(parsedCustomValue)}`
        : selectedOption.platform
          ? `${selectedOption.optionName} - ${selectedOption.platform}`
          : selectedOption.optionName;

    const selectedFulfillmentMode = isGamingTopup
      ? fulfillmentMode
      : undefined;

    const normalizedPlayerId =
      isGamingTopup && fulfillmentMode === "PLAYER_ID_TOPUP"
        ? playerId.trim()
        : undefined;

    const cartId = `${product.id}-${selectedOption.id}-${
      selectedFulfillmentMode ?? valueMode
    }-${Date.now()}`;

    return {
      id: cartId,
      cartId,
      productId: product.id,
      productOptionId: selectedOption.id,
      slug: product.slug,
      categorySlug: product.categorySlug,
      name: product.name,
      title: product.name,
      productName: product.name,
      editionName,
      denomination:
        valueMode === "CUSTOM"
          ? parsedCustomValue
          : selectedOption.denomination ?? selectedOption.optionName,
      amount:
        valueMode === "CUSTOM"
          ? parsedCustomValue
          : selectedOption.denomination ?? 0,
      customValue: selectedCustomValue,
      fulfillmentMode: selectedFulfillmentMode,
      playerId: normalizedPlayerId,
      image: product.imageUrl ?? undefined,
      price: selectedUnitPrice,
      unitPrice: selectedUnitPrice,
      totalPrice,
      quantity,
      minQuantity: 1,
      maxQuantity: maximumQuantity,
      productType: product.productType,
      deliveryType:
        valueMode === "CUSTOM" ||
        selectedFulfillmentMode === "PLAYER_ID_TOPUP"
          ? "MANUAL"
          : product.deliveryType,
      email: email.trim().toLowerCase(),
    };
  }

  function addToCart() {
    if (!validateSelection()) return;

    try {
      const newItem = createCartItem();
      const savedCart = localStorage.getItem("shoppingCart");
      const currentCart = savedCart
        ? (JSON.parse(savedCart) as StoredCartItem[])
        : [];

      currentCart.push(newItem);
      localStorage.setItem("shoppingCart", JSON.stringify(currentCart));
      window.dispatchEvent(new Event("cartUpdated"));
      setMessageType("success");
      setMessage(`${newItem.editionName} added to your cart.`);
    } catch {
      showError("Unable to add this product to your cart.");
    }
  }

  function buyNow() {
    if (!validateSelection()) return;

    try {
      localStorage.setItem("buyNowItem", JSON.stringify(createCartItem()));
      router.push("/checkout");
    } catch {
      showError("Unable to continue to checkout.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    buyNow();
  }

  if (options.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
        This product currently has no available options.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 sm:mt-8">
      {product.customerDiscountPercent > 0 && (
        <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Your {product.customerDiscountPercent}% customer discount applies to this product.
        </div>
      )}
      {isGamingTopup &&
        product.allowsPlayerIdTopup &&
        product.allowsGamingVoucher && (
          <section>
            <h2 className="text-base font-black sm:text-lg">Select delivery method</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
              <button
                type="button"
                onClick={() => changeFulfillmentMode("PLAYER_ID_TOPUP")}
                className={`rounded-xl border p-3 text-left transition sm:p-4 ${
                  fulfillmentMode === "PLAYER_ID_TOPUP"
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-white/10 bg-slate-950 hover:border-cyan-400"
                }`}
              >
                <span className="block font-black">Player ID top-up</span>
                <span className="mt-1 block text-xs opacity-70">
                  Top-up is processed using your Player ID.
                </span>
              </button>

              <button
                type="button"
                onClick={() => changeFulfillmentMode("GAMING_VOUCHER")}
                className={`rounded-xl border p-3 text-left transition sm:p-4 ${
                  fulfillmentMode === "GAMING_VOUCHER"
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-white/10 bg-slate-950 hover:border-cyan-400"
                }`}
              >
                <span className="block font-black">Gaming voucher</span>
                <span className="mt-1 block text-xs opacity-70">
                  Receive a voucher code after payment approval.
                </span>
              </button>
            </div>
          </section>
        )}

      {isGiftCard &&
        product.allowsFixedValues &&
        product.allowsCustomValue && (
          <section>
            <h2 className="text-base font-black sm:text-lg">Select value type</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
              <button
                type="button"
                onClick={() => changeValueMode("FIXED")}
                className={`rounded-xl border px-4 py-3 font-bold transition ${
                  valueMode === "FIXED"
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-white/10 bg-slate-950 hover:border-cyan-400"
                }`}
              >
                Fixed value
              </button>
              <button
                type="button"
                onClick={() => changeValueMode("CUSTOM")}
                className={`rounded-xl border px-4 py-3 font-bold transition ${
                  valueMode === "CUSTOM"
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-white/10 bg-slate-950 hover:border-cyan-400"
                }`}
              >
                Custom value
              </button>
            </div>
          </section>
        )}

      {valueMode === "FIXED" && (
        <section className="mt-5 sm:mt-7">
          <h2 className="text-base font-black sm:text-lg">Select product option</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
            {fixedOptions.map((option) => {
              const isSelected = selectedOptionId === option.id;
              const isUnavailable = option.stockQuantity < 1;

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={isUnavailable}
                  onClick={() => selectOption(option.id)}
                  className={`min-w-0 rounded-xl border p-3 text-left transition sm:p-4 ${
                    isSelected
                      ? "border-cyan-400 bg-cyan-400 text-slate-950"
                      : "border-white/10 bg-slate-950 hover:border-cyan-400"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="block break-words text-sm font-black sm:text-base">{option.optionName}</span>
                  {option.platform && (
                    <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-1 text-xs font-bold">
                      {option.platform}
                    </span>
                  )}
                  <span className="mt-1 block text-sm">
                    {product.customerDiscountPercent > 0 ? (
                      <><span className="font-black">{formatPrice(option.sellingPrice * (1 - product.customerDiscountPercent / 100))}</span>{" "}<span className="text-xs line-through opacity-60">{formatPrice(option.sellingPrice)}</span></>
                    ) : formatPrice(option.sellingPrice)}
                  </span>
                  <span className="mt-1 block text-xs opacity-70">
                    {isUnavailable
                      ? "Out of Stock"
                      : "In Stock"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {valueMode === "CUSTOM" && (
        <section className="mt-5 sm:mt-7">
          <label htmlFor="customValue" className="text-lg font-black">
            Enter custom value
          </label>
          <input
            id="customValue"
            type="number"
            min={product.minimumCustomValue ?? 1}
            max={product.maximumCustomValue ?? undefined}
            step="0.01"
            required
            value={customValue}
            onChange={(event) => {
              setCustomValue(event.target.value);
              clearMessage();
            }}
            placeholder="Enter amount"
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-black outline-none focus:border-cyan-400"
          />
          <p className="mt-2 text-xs text-slate-400">
            Allowed range: {formatPrice(product.minimumCustomValue ?? 0)} to{" "}
            {formatPrice(product.maximumCustomValue ?? 0)}
          </p>
        </section>
      )}

      {isGamingTopup && fulfillmentMode === "PLAYER_ID_TOPUP" && (
        <section className="mt-5 sm:mt-7">
          <label htmlFor="playerId" className="text-sm font-bold">
            {product.playerIdLabel ?? "Player ID"}
          </label>
          <input
            id="playerId"
            required
            minLength={3}
            maxLength={150}
            value={playerId}
            onChange={(event) => {
              setPlayerId(event.target.value);
              clearMessage();
            }}
            placeholder={`Enter ${product.playerIdLabel ?? "Player ID"}`}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
          />
          <p className="mt-2 text-xs text-amber-200">
            Check this value carefully. An incorrect Player ID may delay delivery.
          </p>
        </section>
      )}

      <section className="mt-5 sm:mt-7">
        <label htmlFor="deliveryEmail" className="text-sm font-bold">
          Delivery email
        </label>
        <input
          id="deliveryEmail"
          type="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearMessage();
          }}
          placeholder="customer@example.com"
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        />
      </section>

      <section className="mt-5 sm:mt-7">
        <p className="text-sm font-bold">Quantity</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            disabled={quantity <= 1}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl disabled:opacity-40"
          >
            -
          </button>
          <div className="flex h-11 min-w-20 items-center justify-center rounded-xl border border-white/10 bg-slate-950 font-black">
            {quantity}
          </div>
          <button
            type="button"
            onClick={() =>
              setQuantity((current) => Math.min(maximumQuantity, current + 1))
            }
            disabled={maximumQuantity < 1 || quantity >= maximumQuantity}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl disabled:opacity-40"
          >
            +
          </button>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950 p-4 sm:mt-7 sm:p-5">
        <div className="flex justify-between gap-4 text-sm text-slate-400">
          <span>Selected option</span>
          <span className="text-right font-bold text-white">
            {valueMode === "CUSTOM"
              ? customValue
                ? `Custom Value ${formatPrice(parsedCustomValue)}`
                : "Enter custom value"
              : selectedFixedOption
                ? selectedFixedOption.platform
                  ? `${selectedFixedOption.optionName} - ${selectedFixedOption.platform}`
                  : selectedFixedOption.optionName
                : "Not selected"}
          </span>
        </div>

        {isGamingTopup && (
          <div className="mt-3 flex justify-between gap-4 text-sm text-slate-400">
            <span>Delivery method</span>
            <span className="text-right font-bold text-white">
              {fulfillmentMode === "PLAYER_ID_TOPUP"
                ? "Player ID top-up"
                : "Gaming voucher"}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="font-bold">Total</span>
          <span className="text-2xl font-black text-cyan-400">
            {formatPrice(customerTotal)}
          </span>
        </div>
        {customerDiscountAmount > 0 && (
          <div className="mt-2 flex justify-between text-xs text-emerald-300">
            <span>Your discount</span><span>-{formatPrice(customerDiscountAmount)}</span>
          </div>
        )}
      </section>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
        <button
          type="button"
          onClick={addToCart}
          className="rounded-xl border-2 border-cyan-400 px-3 py-3.5 text-sm font-black text-cyan-400 transition hover:bg-cyan-400/10 sm:px-6 sm:py-4 sm:text-base"
        >
          Add to Cart
        </button>
        <button
          type="submit"
          className="rounded-xl bg-cyan-400 px-3 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-6 sm:py-4 sm:text-base"
        >
          Buy Now
        </button>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-xl border p-4 text-sm ${
            messageType === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-400/10 text-red-200"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
