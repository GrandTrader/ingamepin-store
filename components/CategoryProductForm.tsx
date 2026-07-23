"use client";

import {
  ChangeEvent,
  FormEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryProductOption,
  ProductCategory,
} from "@/data/categoryProducts";

type CategoryProductFormProps = {
  category: ProductCategory;
};

type SelectionType = "fixed" | "custom";

type CartItem = {
  cartId: string;
  categorySlug: string;
  productName: string;
  amount: number;
  quantity: number;
  email: string;
  unitPrice: number;
  totalPrice: number;
};

export default function CategoryProductForm({
  category,
}: CategoryProductFormProps) {
  const router = useRouter();
  const firstOption = category.options[0];

  const [selectionType, setSelectionType] =
    useState<SelectionType>("fixed");

  const [selectedOptionId, setSelectedOptionId] = useState(
    firstOption?.id ?? 0
  );

  const [customAmount, setCustomAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("success");

  const selectedOption: CategoryProductOption | undefined =
    useMemo(() => {
      return category.options.find(
        (option) => option.id === selectedOptionId
      );
    }, [category.options, selectedOptionId]);

  const minimumCustomAmount = category.customAmountMin ?? 100;
  const maximumCustomAmount = category.customAmountMax ?? 10000;

  const parsedCustomAmount = Number(customAmount);

  const isCustomAmountValid =
    selectionType === "custom" &&
    Number.isInteger(parsedCustomAmount) &&
    parsedCustomAmount >= minimumCustomAmount &&
    parsedCustomAmount <= maximumCustomAmount;

  const selectedAmount =
    selectionType === "custom"
      ? isCustomAmountValid
        ? parsedCustomAmount
        : 0
      : selectedOption?.denomination ?? 0;

  const unitPrice =
    selectionType === "custom"
      ? isCustomAmountValid
        ? parsedCustomAmount
        : 0
      : selectedOption?.sellingPrice ?? 0;

  const maximumQuantity = 10;

  const totalPrice = unitPrice * quantity;

  function showError(text: string) {
    setMessageType("error");
    setMessage(text);
  }

  function showSuccess(text: string) {
    setMessageType("success");
    setMessage(text);
  }

  function selectFixedOption(option: CategoryProductOption) {
    setSelectionType("fixed");
    setSelectedOptionId(option.id);
    setCustomAmount("");
    setQuantity(1);
    setMessage("");
  }

  function selectCustomAmount() {
    setSelectionType("custom");
    setQuantity(1);
    setMessage("");
  }

  function handleCustomAmountChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setCustomAmount(event.target.value);
    setQuantity(1);
    setMessage("");
  }

  function decreaseQuantity() {
    setQuantity((current) =>
      current > 1 ? current - 1 : 1
    );

    setMessage("");
  }

  function increaseQuantity() {
    setQuantity((current) =>
      current < maximumQuantity ? current + 1 : current
    );

    setMessage("");
  }

  function validateOrder(): boolean {
    if (
      selectionType === "fixed" &&
      !selectedOption
    ) {
      showError("Please select a denomination.");
      return false;
    }

    if (
      selectionType === "custom" &&
      !isCustomAmountValid
    ) {
      showError(
        `Please enter an amount between $${minimumCustomAmount.toLocaleString(
          "en-US"
        )} and $${maximumCustomAmount.toLocaleString(
          "en-US"
        )}.`
      );

      return false;
    }

    if (!email.trim()) {
      showError(
        "Recipient email address is required."
      );
      return false;
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.trim())) {
      showError(
        "Please enter a valid recipient email address."
      );
      return false;
    }

    if (quantity < 1) {
      showError("Quantity must be at least 1.");
      return false;
    }

    if (quantity > maximumQuantity) {
      showError(
        `Maximum allowed quantity is ${maximumQuantity}.`
      );
      return false;
    }

    return true;
  }

  function createCartItem(): CartItem {
    return {
      cartId: `${category.slug}-${selectedAmount}-${Date.now()}`,
      categorySlug: category.slug,
      productName: category.name,
      amount: selectedAmount,
      quantity,
      email: email.trim(),
      unitPrice,
      totalPrice,
    };
  }

  function addToCart() {
    if (!validateOrder()) {
      return;
    }

    const newItem = createCartItem();

    try {
      const currentCart = localStorage.getItem(
        "shoppingCart"
      );

      const cart: CartItem[] = currentCart
        ? JSON.parse(currentCart)
        : [];

      cart.push(newItem);

      localStorage.setItem(
        "shoppingCart",
        JSON.stringify(cart)
      );

      window.dispatchEvent(new Event("cartUpdated"));

      showSuccess(
        `${category.name} $${selectedAmount.toLocaleString(
          "en-US"
        )} × ${quantity} added to your cart.`
      );
    } catch {
      showError(
        "Unable to add the product to your cart."
      );
    }
  }

  function buyNow() {
    if (!validateOrder()) {
      return;
    }

    const buyNowItem = createCartItem();

    localStorage.setItem(
      "buyNowItem",
      JSON.stringify(buyNowItem)
    );

    router.push("/checkout");
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    buyNow();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-black text-white">
            Select amount{" "}
            <span className="text-red-400">*</span>
          </h3>

          {category.allowCustomAmount && (
            <span className="text-sm text-slate-400">
              $
              {minimumCustomAmount.toLocaleString(
                "en-US"
              )}{" "}
              – $
              {maximumCustomAmount.toLocaleString(
                "en-US"
              )}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-slate-400">
          Select your required product value.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {category.options.map((option) => {
            const isSelected =
              selectionType === "fixed" &&
              selectedOptionId === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  selectFixedOption(option)
                }
                className={`rounded-xl border px-5 py-3 text-sm font-bold transition ${
                  isSelected
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-white/15 bg-slate-950 text-white hover:border-cyan-400"
                }`}
              >
                $
                {Number(option.denomination ?? 0).toLocaleString(
                  "en-US"
                )}
              </button>
            );
          })}

          {category.allowCustomAmount && (
            <button
              type="button"
              onClick={selectCustomAmount}
              className={`rounded-xl border px-5 py-3 text-sm font-bold transition ${
                selectionType === "custom"
                  ? "border-cyan-400 bg-cyan-400 text-slate-950"
                  : "border-white/15 bg-slate-950 text-white hover:border-cyan-400"
              }`}
            >
              Other amount
            </button>
          )}
        </div>
      </section>

      {category.allowCustomAmount &&
        selectionType === "custom" && (
          <section className="mt-6">
            <label
              htmlFor="customAmount"
              className="text-sm font-bold text-white"
            >
              Enter gift amount{" "}
              <span className="text-red-400">*</span>
            </label>

            <p className="mt-1 text-sm text-slate-400">
              Enter any amount from $
              {minimumCustomAmount.toLocaleString(
                "en-US"
              )}{" "}
              to $
              {maximumCustomAmount.toLocaleString(
                "en-US"
              )}
              .
            </p>

            <div className="mt-3 flex overflow-hidden rounded-xl border border-white/15 bg-slate-950 focus-within:border-cyan-400">
              <span className="flex items-center border-r border-white/15 px-4 text-lg font-black text-white">
                $
              </span>

              <input
                id="customAmount"
                name="customAmount"
                type="number"
                min={minimumCustomAmount}
                max={maximumCustomAmount}
                step="1"
                value={customAmount}
                onChange={handleCustomAmountChange}
                placeholder="Enter other amount"
                required={selectionType === "custom"}
                className="w-full bg-transparent px-4 py-3 text-white outline-none placeholder:text-slate-600"
              />
            </div>

            {customAmount !== "" &&
              !isCustomAmountValid && (
                <p className="mt-2 text-sm font-medium text-red-400">
                  The amount must be between $
                  {minimumCustomAmount.toLocaleString(
                    "en-US"
                  )}{" "}
                  and $
                  {maximumCustomAmount.toLocaleString(
                    "en-US"
                  )}
                  .
                </p>
              )}
          </section>
        )}

      <section className="mt-8">
        <label
          htmlFor="deliveryEmail"
          className="text-sm font-bold text-white"
        >
          Recipient email address{" "}
          <span className="text-red-400">*</span>
        </label>

        <p className="mt-1 text-sm text-slate-400">
          Your product code will be delivered to
          this email address after successful
          payment.
        </p>

        <input
          id="deliveryEmail"
          name="deliveryEmail"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setMessage("");
          }}
          placeholder="Enter recipient email address"
          required
          autoComplete="email"
          className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
        />
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-white">
            Quantity{" "}
            <span className="text-red-400">*</span>
          </p>

          <p className="text-xs font-medium text-slate-400">
            Maximum 10 products per order
          </p>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={decreaseQuantity}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-slate-800 text-xl font-bold text-white transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>

          <div className="flex h-11 min-w-20 items-center justify-center rounded-xl border border-white/15 bg-slate-950 px-5 font-black text-white">
            {quantity}
          </div>

          <button
            type="button"
            onClick={increaseQuantity}
            disabled={
              selectedAmount <= 0 ||
              quantity >= maximumQuantity
            }
            aria-label="Increase quantity"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-slate-800 text-xl font-bold text-white transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-slate-950 p-5">
        <div className="flex items-center justify-between gap-4 text-sm text-slate-400">
          <span>Product</span>

          <span className="max-w-[65%] text-right font-medium text-white">
            {category.shortName}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 text-sm text-slate-400">
          <span>Amount</span>

          <span className="font-medium text-white">
            $
            {selectedAmount.toLocaleString(
              "en-US"
            )}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 text-sm text-slate-400">
          <span>Quantity</span>

          <span className="font-medium text-white">
            {quantity}
          </span>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-bold text-white">
              Total amount
            </span>

            <span className="text-2xl font-black text-cyan-400">
              $
              {totalPrice.toLocaleString(
                "en-US"
              )}
            </span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={addToCart}
          className="rounded-xl border-2 border-cyan-400 px-6 py-4 font-black text-cyan-400 transition hover:bg-cyan-400/10"
        >
          🛒 Add to Cart
        </button>

        <button
          type="submit"
          className="rounded-xl bg-cyan-400 px-6 py-4 font-black text-slate-950 transition hover:bg-cyan-300"
        >
          ⚡ Buy Now
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

      <p className="mt-4 text-center text-xs text-slate-500">
        All fields marked with * are mandatory.
        Check the recipient email carefully before
        completing payment.
      </p>
    </form>
  );
}
