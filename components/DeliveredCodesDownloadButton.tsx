"use client";

export type DownloadableCodeItem = {
  productName: string;
  optionName?: string | null;
  denomination?: number | string | null;
  platform?: string | null;
  region?: string | null;
  codes: string[];
};

type DeliveredCodesDownloadButtonProps = {
  orderNumber: string;
  items: DownloadableCodeItem[];
  label: string;
  variant?: "primary" | "secondary";
};

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "delivered-codes";
}

export function buildDeliveredCodesFileName(
  orderNumber: string,
  items: DownloadableCodeItem[],
) {
  const itemParts = items
    .filter((item) => item.codes.some((code) => code.trim()))
    .map((item) => {
      const product = safeFileName(item.productName).slice(0, 55);
      const denomination = safeFileName(
        item.denomination !== null && item.denomination !== undefined
          ? String(item.denomination)
          : item.optionName || item.platform || "standard",
      ).slice(0, 35);
      const quantity = item.codes.filter((code) => code.trim()).length;

      return `${product}-${denomination}_x_${quantity}`;
    });
  const readableItems = (itemParts.join("__") || "delivered-codes").slice(
    0,
    150,
  );
  const readableOrder = safeFileName(orderNumber).slice(0, 60);

  return `${readableItems}_${readableOrder}.txt`;
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createFileContent(items: DownloadableCodeItem[]) {
  return items
    .flatMap((item) => item.codes)
    .map((code) => code.trim())
    .filter(Boolean)
    .join("\r\n");
}

export default function DeliveredCodesDownloadButton({
  orderNumber,
  items,
  label,
  variant = "secondary",
}: DeliveredCodesDownloadButtonProps) {
  const deliveredItems = items
    .map((item) => ({
      ...item,
      codes: item.codes.filter(Boolean),
    }))
    .filter((item) => item.codes.length > 0);

  if (deliveredItems.length === 0) {
    return null;
  }

  function downloadCodes() {
    downloadTextFile(
      buildDeliveredCodesFileName(orderNumber, deliveredItems),
      createFileContent(deliveredItems),
    );
  }

  return (
    <button
      type="button"
      onClick={downloadCodes}
      className={
        variant === "primary"
          ? "rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
          : "rounded-xl border border-cyan-500/30 bg-cyan-50 px-4 py-2.5 text-sm font-bold text-cyan-700 transition hover:border-cyan-500 hover:bg-cyan-100"
      }
    >
      {label}
    </button>
  );
}
