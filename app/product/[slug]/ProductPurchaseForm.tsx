"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStorePreferences } from "@/components/StorePreferences";
import LocalizedProductText from "@/components/LocalizedProductText";

type ProductOption = {
  id: string;
  optionName: string;
  platform: string | null;
  denomination: number | null;
  sellingPrice: number;
  stockQuantity: number;
  isCustomValue: boolean;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  isInStock: boolean;
};

type FulfillmentMode =
  | "PLAYER_ID_TOPUP"
  | "GAMING_VOUCHER";

type ValueMode = "FIXED" | "CUSTOM";

type CustomerField = {
  id: string;
  label: string;
  placeholder: string | null;
  fieldType: "TEXT" | "EMAIL" | "NUMBER" | "TEXTAREA";
  isRequired: boolean;
};

type CustomerInformation = {
  fieldId: string;
  label: string;
  value: string;
};

type ProductPurchaseFormProps = {
  product: {
    id: string;
    slug: string;
    categorySlug: string;
    name: string;
    nameRu?: string | null;
    imageUrl: string | null;
    imageUrlRu?: string | null;
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
    affiliateCommissionPercent?: number;
    affiliateMaximumCommissionPercent?: number;
    isBulkOrder?: boolean;
    bulkDeliveryInstructions?: string | null;
    minimumQuantity: number;
    maximumQuantity: number;
    isUnlimitedStock?: boolean;
  };
  options: ProductOption[];
  customerFields?: CustomerField[];
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
  maxQuantity?: number;
  isBulkOrder?: boolean;
  productType: string;
  deliveryType: string;
  customerInformation: CustomerInformation[];
};

function hasBrokenProductText(value: string) {
  return /(?:Ã|Â|Ð|Ñ|â€|â€“|â€”|â†)/.test(value);
}

export default function ProductPurchaseForm({
  product,
  options,
  customerFields = [],
}: ProductPurchaseFormProps) {
  const router = useRouter();
  const {
    language,
    t,
    formatPrice: formatStorePrice,
  } = useStorePreferences();
  const localizedProductName =
    language === "ru" && product.nameRu && !hasBrokenProductText(product.nameRu) ? product.nameRu : product.name;
  const localizedProductImage =
    language === "ru" && product.imageUrlRu
      ? product.imageUrlRu
      : product.imageUrl;
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
        option.isInStock &&
        (product.isBulkOrder || product.isUnlimitedStock || option.stockQuantity > 0) &&
        option.optionName
          .toLowerCase()
          .includes("standard"),
    ) ??
    fixedOptions.find(
      (option) => option.isInStock && (product.isBulkOrder || product.isUnlimitedStock || option.stockQuantity > 0),
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
  const [customerValues, setCustomerValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");
  const [bulkConfirmationAction, setBulkConfirmationAction] = useState<"cart" | "buy" | null>(null);

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

  const affiliatePriceMultiplier =
    1 + Math.max(0, product.affiliateCommissionPercent ?? 0) / 100;

  function applyAffiliateMarkup(basePrice: number) {
    const markup = Math.round(
      basePrice * (affiliatePriceMultiplier - 1) * 100,
    ) / 100;

    return Math.round((basePrice + markup) * 100) / 100;
  }

  const selectedUnitPrice =
    valueMode === "CUSTOM"
      ? Number.isFinite(parsedCustomValue)
        ? applyAffiliateMarkup(parsedCustomValue)
        : 0
      : applyAffiliateMarkup(selectedFixedOption?.sellingPrice ?? 0);

  const requiresSingleQuantity =
    valueMode === "CUSTOM" ||
    (isGamingTopup && fulfillmentMode === "PLAYER_ID_TOPUP");

  const configuredMaximumQuantity = Math.max(
    1,
    selectedFixedOption?.maximumQuantity ?? product.maximumQuantity,
  );
  const maximumQuantity = requiresSingleQuantity
    ? 1
    : product.isBulkOrder
      ? Number.MAX_SAFE_INTEGER
      : Math.min(
          configuredMaximumQuantity,
          selectedFixedOption?.stockQuantity ?? 0,
        );
  const minimumQuantity = requiresSingleQuantity
    ? 1
    : product.isBulkOrder
      ? 1
    : Math.max(
        1,
        selectedFixedOption?.minimumQuantity ?? product.minimumQuantity,
      );

  const totalPrice = selectedUnitPrice * quantity;
  const customerDiscountAmount =
    totalPrice * Math.max(0, product.customerDiscountPercent) / 100;
  const customerTotal = totalPrice - customerDiscountAmount;
  const affiliateMaximumCommissionPercent = Math.max(
    0,
    product.affiliateMaximumCommissionPercent ?? 0,
  );
  const affiliateMaximumEarning =
    (valueMode === "CUSTOM"
      ? Number.isFinite(parsedCustomValue)
        ? parsedCustomValue
        : 0
      : selectedFixedOption?.sellingPrice ?? 0) *
    affiliateMaximumCommissionPercent /
    100;

  function formatPrice(value: number) {
    return formatStorePrice(value);
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

    if (!selectedOption.isInStock) {
      return showError("The selected option is out of stock.");
    }

    if (
      valueMode === "FIXED" &&
      !product.isBulkOrder &&
      !product.isUnlimitedStock &&
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

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < minimumQuantity ||
      (!product.isBulkOrder && quantity > maximumQuantity)
    ) {
      return showError(`Allowed quantity for ${localizedProductName}: ${minimumQuantity}-${maximumQuantity}.`);
    }

    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      for (const field of customerFields) {
        const value = (customerValues[`${unitIndex}:${field.id}`] ?? "").trim();
        const unitLabel = quantity > 1 ? ` for item ${unitIndex + 1}` : "";
        if (field.isRequired && !value) return showError(`${field.label}${unitLabel} is required.`);
        if (value.length > 500) return showError(`${field.label}${unitLabel} is too long.`);
        if (value && field.fieldType === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return showError(`Enter a valid ${field.label}${unitLabel}.`);
        }
        if (value && field.fieldType === "NUMBER" && !/^-?[0-9]+([.][0-9]+)?$/.test(value)) {
          return showError(`Enter a valid ${field.label}${unitLabel}.`);
        }
      }
    }

    return true;
  }

  function createCartItem(unitIndex = 0, separateUnit = false): StoredCartItem {
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
    }-${Date.now()}-${unitIndex}`;

    return {
      id: cartId,
      cartId,
      productId: product.id,
      productOptionId: selectedOption.id,
      slug: product.slug,
      categorySlug: product.categorySlug,
      name: localizedProductName,
      title: localizedProductName,
      productName: localizedProductName,
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
      image: localizedProductImage ?? undefined,
      price: selectedUnitPrice,
      unitPrice: selectedUnitPrice,
      totalPrice: separateUnit ? selectedUnitPrice : totalPrice,
      quantity: separateUnit ? 1 : quantity,
      minQuantity: separateUnit ? 1 : minimumQuantity,
      maxQuantity: separateUnit ? 1 : product.isBulkOrder ? undefined : maximumQuantity,
      isBulkOrder: Boolean(product.isBulkOrder),
      productType: product.productType,
      deliveryType:
        valueMode === "CUSTOM" ||
        selectedFulfillmentMode === "PLAYER_ID_TOPUP"
          ? "MANUAL"
          : product.deliveryType,
      customerInformation: customerFields
        .map((field) => ({
          fieldId: field.id,
          label: field.label,
          value: (customerValues[`${unitIndex}:${field.id}`] ?? "").trim(),
        }))
        .filter((field) => field.value),
    };
  }

  function createCartItems() {
    const separateUnits = customerFields.length > 0 && quantity > 1;
    return separateUnits
      ? Array.from({ length: quantity }, (_, index) => createCartItem(index, true))
      : [createCartItem(0, false)];
  }

  function completeAddToCart() {
    try {
      const newItems = createCartItems();
      const savedCart = localStorage.getItem("shoppingCart");
      const currentCart = savedCart
        ? (JSON.parse(savedCart) as StoredCartItem[])
        : [];

      currentCart.push(...newItems);
      localStorage.setItem("shoppingCart", JSON.stringify(currentCart));
      window.dispatchEvent(new Event("cartUpdated"));
      setMessageType("success");
      setMessage(`${newItems.length} item${newItems.length === 1 ? "" : "s"} added to your cart.`);
    } catch {
      showError("Unable to add this product to your cart.");
    }
  }

  function completeBuyNow() {
    try {
      const newItems = createCartItems();
      localStorage.setItem(
        "buyNowItem",
        JSON.stringify(newItems.length === 1 ? newItems[0] : newItems),
      );
      router.push("/checkout");
    } catch {
      showError("Unable to continue to checkout.");
    }
  }

  function addToCart() {
    if (!validateSelection()) return;
    if (product.isBulkOrder) {
      setBulkConfirmationAction("cart");
      return;
    }
    completeAddToCart();
  }

  function buyNow() {
    if (!validateSelection()) return;
    if (product.isBulkOrder) {
      setBulkConfirmationAction("buy");
      return;
    }
    completeBuyNow();
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
        <div
          className="customer-discount-notice mb-5 rounded-xl border p-4 text-sm font-black"
          style={{
            backgroundColor: "#ecfdf5",
            borderColor: "#34d399",
            color: "#064e3b",
            WebkitTextFillColor: "#064e3b",
          }}
        >
          <LocalizedProductText
            english={`Your ${product.customerDiscountPercent}% customer discount applies to this product.`}
            russian={`На этот товар действует ваша скидка ${product.customerDiscountPercent}%.`}
          />
        </div>
      )}
      {isGamingTopup &&
        product.allowsPlayerIdTopup &&
        product.allowsGamingVoucher && (
          <section>
            <h2 className="text-base font-black sm:text-lg">{t("selectDeliveryMethod")}</h2>
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
                <span className="block font-black">{t("playerIdTopup")}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {t("playerIdTopupDescription")}
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
                <span className="block font-black">{t("gamingVoucher")}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {t("gamingVoucherDescription")}
                </span>
              </button>
            </div>
          </section>
        )}

      {isGiftCard &&
        product.allowsFixedValues &&
        product.allowsCustomValue && (
          <section>
            <h2 className="text-base font-black sm:text-lg">{t("selectValueType")}</h2>
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
                {t("fixedValue")}
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
                {t("customValue")}
              </button>
            </div>
          </section>
        )}

      {valueMode === "FIXED" && (
        <section className="mt-5 sm:mt-7">
          <h2 className="text-base font-black sm:text-lg">{t("selectProductOption")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
            {fixedOptions.map((option) => {
              const isSelected = selectedOptionId === option.id;
              const isUnavailable =
                !option.isInStock ||
                (!product.isBulkOrder && !product.isUnlimitedStock && option.stockQuantity < 1);

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
                      <><span className="font-black">{formatPrice(applyAffiliateMarkup(option.sellingPrice) * (1 - product.customerDiscountPercent / 100))}</span>{" "}<span className="text-xs line-through opacity-60">{formatPrice(applyAffiliateMarkup(option.sellingPrice))}</span></>
                    ) : formatPrice(applyAffiliateMarkup(option.sellingPrice))}
                  </span>
                  {(isUnavailable ||
                    (!product.isBulkOrder &&
                      !product.isUnlimitedStock &&
                      option.stockQuantity > 0 &&
                      option.stockQuantity < 5)) && (
                    <span className={`mt-1 block text-xs font-bold ${
                      isUnavailable ? "opacity-70" : "text-amber-400"
                    }`}>
                      {isUnavailable
                        ? t("outOfStock")
                        : `Only ${option.stockQuantity.toLocaleString("en-IN")} Left`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {valueMode === "CUSTOM" && (
        <section className="mt-5 sm:mt-7">
          <label htmlFor="customValue" className="text-lg font-black">
            {t("enterCustomValue")}
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
            placeholder={t("enterAmount")}
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-black outline-none focus:border-cyan-400"
          />
          <p className="mt-2 text-xs text-slate-400">
            {t("allowedRange")}: {formatPrice(product.minimumCustomValue ?? 0)} –{" "}
            {formatPrice(product.maximumCustomValue ?? 0)}
          </p>
        </section>
      )}

      {isGamingTopup && fulfillmentMode === "PLAYER_ID_TOPUP" && (
        <section className="mt-5 sm:mt-7">
          <label htmlFor="playerId" className="text-sm font-bold">
            {product.playerIdLabel ?? t("playerId")}
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
            placeholder={`${t("enterAmount").replace(
              language === "ru" ? "сумму" : "amount",
              product.playerIdLabel ?? t("playerId"),
            )}`}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
          />
          <p className="mt-2 text-xs text-amber-200">
            {t("checkPlayerId")}
          </p>
        </section>
      )}

      {customerFields.length > 0 && (
        <section className="mt-5 grid gap-4 sm:mt-7">
          {Array.from({ length: quantity }, (_, unitIndex) => (
            <div key={unitIndex} className="grid gap-4 rounded-2xl border border-white/10 p-4">
              {quantity > 1 && (
                <h2 className="text-sm font-black text-cyan-400">
                  Customer information {unitIndex + 1}
                </h2>
              )}
              {customerFields.map((field) => {
                const valueKey = `${unitIndex}:${field.id}`;
                return (
                  <label key={field.id}>
                    <span className="text-sm font-bold">
                      {field.label}
                      {field.isRequired && <span className="ml-1 text-red-300">*</span>}
                    </span>
                    {field.fieldType === "TEXTAREA" ? (
                      <textarea
                        rows={3}
                        required={field.isRequired}
                        maxLength={500}
                        value={customerValues[valueKey] ?? ""}
                        onChange={(event) => {
                          setCustomerValues((current) => ({ ...current, [valueKey]: event.target.value }));
                          clearMessage();
                        }}
                        placeholder={field.placeholder ?? ""}
                        className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                      />
                    ) : (
                      <input
                        type={field.fieldType === "EMAIL" ? "email" : field.fieldType === "NUMBER" ? "number" : "text"}
                        required={field.isRequired}
                        maxLength={field.fieldType === "NUMBER" ? undefined : 500}
                        value={customerValues[valueKey] ?? ""}
                        onChange={(event) => {
                          setCustomerValues((current) => ({ ...current, [valueKey]: event.target.value }));
                          clearMessage();
                        }}
                        placeholder={field.placeholder ?? ""}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </section>
      )}

      <section className="mt-5 sm:mt-7">
        <p className="text-sm font-bold">{t("quantity")}</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setQuantity((current) =>
                Math.max(minimumQuantity, current - 1),
              )
            }
            disabled={quantity <= minimumQuantity}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl disabled:opacity-40"
          >
            -
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={minimumQuantity}
            max={product.isBulkOrder ? undefined : maximumQuantity}
            step={1}
            value={quantity}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              const requestedQuantity = event.currentTarget.valueAsNumber;
              if (!Number.isSafeInteger(requestedQuantity)) return;
              setQuantity(
                product.isBulkOrder
                  ? Math.max(1, requestedQuantity)
                  : Math.min(
                      maximumQuantity,
                      Math.max(minimumQuantity, requestedQuantity),
                    ),
              );
              clearMessage();
            }}
            aria-label="Enter quantity"
            className="h-11 w-24 rounded-xl border border-white/10 bg-slate-950 px-3 text-center font-black outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={() =>
              setQuantity((current) =>
                product.isBulkOrder
                  ? current + 1
                  : Math.min(maximumQuantity, current + 1),
              )
            }
            disabled={
              !product.isBulkOrder &&
              (maximumQuantity < 1 || quantity >= maximumQuantity)
            }
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="product-quantity-limit mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100">
          {product.isBulkOrder
            ? language === "ru"
              ? "Без ограничения количества"
              : "No quantity limit for this digital product"
            : language === "ru"
              ? `Допустимое количество: ${minimumQuantity}–${maximumQuantity}`
              : `Allowed quantity: ${minimumQuantity}-${maximumQuantity}`}
        </p>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950 p-4 sm:mt-7 sm:p-5">
        <div className="flex justify-between gap-4 text-sm text-slate-400">
          <span>{t("selectedOption")}</span>
          <span className="text-right font-bold text-white">
            {valueMode === "CUSTOM"
              ? customValue
                ? `${t("customValue")} ${formatPrice(parsedCustomValue)}`
                : t("enterCustomValue")
              : selectedFixedOption
                ? selectedFixedOption.platform
                  ? `${selectedFixedOption.optionName} - ${selectedFixedOption.platform}`
                  : selectedFixedOption.optionName
                : t("notSelected")}
          </span>
        </div>

        {isGamingTopup && (
          <div className="mt-3 flex justify-between gap-4 text-sm text-slate-400">
            <span>{t("deliveryMethod")}</span>
            <span className="text-right font-bold text-white">
              {fulfillmentMode === "PLAYER_ID_TOPUP"
                ? t("playerIdTopup")
                : t("gamingVoucher")}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="font-bold">{t("total")}</span>
          <span className="text-2xl font-black text-cyan-400">
            {formatPrice(customerTotal)}
          </span>
        </div>
        {customerDiscountAmount > 0 && (
          <div className="mt-2 flex justify-between text-xs text-emerald-300">
            <span>{t("yourDiscountShort")}</span><span>-{formatPrice(customerDiscountAmount)}</span>
          </div>
        )}
      </section>

      {affiliateMaximumCommissionPercent > 0 && (
        <Link
          href={`/affiliate-program?product=${encodeURIComponent(product.slug)}`}
          className="product-affiliate-banner mt-5 flex items-center justify-between gap-4 rounded-2xl border border-amber-300/40 bg-gradient-to-r from-amber-300/15 to-cyan-400/10 p-4 transition hover:border-amber-200 hover:bg-amber-300/20 sm:mt-6 sm:p-5"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-300 text-xl text-slate-950">
            ◈
          </span>
          <span className="min-w-0 flex-1">
            <span className="product-affiliate-label block text-xs font-bold uppercase tracking-widest text-amber-200">
              {language === "ru"
                ? "Партнёрская возможность"
                : "Affiliate opportunity"}
            </span>
            <span className="product-affiliate-title mt-1 block font-black text-white">
              {language === "ru" ? "Заработайте до" : "Earn up to"}{" "}
              {formatPrice(affiliateMaximumEarning)}{" "}
              {language === "ru" ? "на этом товаре!" : "on this product!"}
            </span>
            <span className="product-affiliate-copy mt-1 block text-xs text-slate-400">
              {language === "ru"
                ? "Присоединяйтесь к программе и делитесь своей уникальной ссылкой."
                : "Join the program and share your unique product link."}
            </span>
          </span>
          <span aria-hidden="true" className="product-affiliate-arrow text-2xl text-amber-200">
            →
          </span>
        </Link>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
        <button
          type="button"
          onClick={addToCart}
          className="rounded-xl border-2 border-cyan-400 px-3 py-3.5 text-sm font-black text-cyan-400 transition hover:bg-cyan-400/10 sm:px-6 sm:py-4 sm:text-base"
        >
          {t("addToCart")}
        </button>
        <button
          type="submit"
          className="rounded-xl bg-cyan-400 px-3 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-6 sm:py-4 sm:text-base"
        >
          {t("buyNow")}
        </button>
      </div>

      {bulkConfirmationAction && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-confirmation-title">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/40 bg-slate-900 p-6 shadow-2xl">
            <h2 id="bulk-confirmation-title" className="text-xl font-black text-amber-200">Digital delivery information</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-200">{product.bulkDeliveryInstructions || "Digital Delivery Time: 1-15 Working Days"}</p>
            <p className="mt-3 text-sm text-slate-400">Please confirm that you understand the delivery time.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setBulkConfirmationAction(null)} className="rounded-xl border border-white/15 px-4 py-3 font-black">Cancel</button>
              <button type="button" onClick={() => { const action = bulkConfirmationAction; setBulkConfirmationAction(null); if (action === "cart") completeAddToCart(); else completeBuyNow(); }} className="rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950">I understand</button>
            </div>
          </div>
        </div>
      )}

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
