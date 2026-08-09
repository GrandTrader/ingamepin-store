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
    .slice(0, 80) || "delivered-codes";
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

function createFileContent(
  orderNumber: string,
  items: DownloadableCodeItem[],
) {
  const lines = [
    "iNGamePIN - Delivered Digital Codes",
    `Order: ${orderNumber}`,
    "",
  ];

  items.forEach((item, itemIndex) => {
    lines.push(`Product: ${item.productName}`);

    if (item.optionName) {
      lines.push(`Option: ${item.optionName}`);
    }

    if (item.denomination !== null && item.denomination !== undefined) {
      lines.push(`Denomination: ${item.denomination}`);
    }

    if (item.platform) {
      lines.push(`Platform: ${item.platform}`);
    }

    if (item.region) {
      lines.push(`Region: ${item.region}`);
    }

    item.codes.forEach((code, codeIndex) => {
      lines.push(`Code ${codeIndex + 1}: ${code}`);
    });

    if (itemIndex < items.length - 1) {
      lines.push("", "----------------------------------------", "");
    }
  });

  lines.push("", "Keep these codes private and redeem them only on the official platform.");
  return lines.join("\r\n");
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
      `${safeFileName(orderNumber)}-delivered-codes.txt`,
      createFileContent(orderNumber, deliveredItems),
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
