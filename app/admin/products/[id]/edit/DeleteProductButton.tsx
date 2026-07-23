"use client";

import { FormEvent, useState } from "react";

import { deleteProduct } from "../../actions";

type DeleteProductButtonProps = {
  productId: string;
  productName: string;
};

export default function DeleteProductButton({
  productId,
  productName,
}: DeleteProductButtonProps) {
  const [isDeleting, setIsDeleting] =
    useState(false);

  function confirmDeletion(
    event: FormEvent<HTMLFormElement>,
  ) {
    const confirmed = window.confirm(
      `Delete "${productName}" permanently? This cannot be undone.`,
    );

    if (!confirmed) {
      event.preventDefault();
      return;
    }

    setIsDeleting(true);
  }

  return (
    <form
      action={deleteProduct}
      onSubmit={confirmDeletion}
      className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6"
    >
      <input
        type="hidden"
        name="id"
        value={productId}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-black text-red-800">
            Delete product
          </h2>

          <p className="mt-1 text-sm text-red-700">
            Only products without order history can be deleted permanently.
          </p>
        </div>

        <button
          type="submit"
          disabled={isDeleting}
          className="rounded-xl bg-red-600 px-6 py-3 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {isDeleting
            ? "Deleting..."
            : "Delete product"}
        </button>
      </div>
    </form>
  );
}
