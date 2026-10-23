import { faceDenomination, formatFaceValue, type FaceValueItem } from "./face-value";

export type SupplierQuotationItem = {
  id: string;
  productName: string;
  optionName: string;
  platform: string | null;
  quantity: number;
  remainingQuantity: number;
  denomination: number | null;
  denominationCurrency: string | null;
};

export type QuotationSelection = Record<string, { selected: boolean; quantity: string }>;
export type SupplierQuotationLine = SupplierQuotationItem & {
  faceValueMinor: number | null;
  discountMinor: number | null;
  supplierTotalMinor: number | null;
};
export type SupplierQuotation = {
  reference: string;
  orderNumber: string;
  createdAt: string;
  supplier: string;
  note: string;
  lines: SupplierQuotationLine[];
  discountPercent: number;
  discountAmount: string;
  supplierTotal: string;
  totalQuantity: number;
  faceValue: string;
};

// Explicitly select supplier-facing fields. Customer data, codes and sale prices
// must never be copied into quotation props or exported documents.
export function supplierQuotationItem(
  item: FaceValueItem & { id: string; product_name: string; option_name: string | null; platform: string | null },
  deliveredQuantity: number,
  refundedQuantity: number,
): SupplierQuotationItem {
  const face = faceDenomination(item);
  return {
    id: item.id,
    productName: item.product_name,
    optionName: item.option_name || (face ? face.amount + " " + face.currency : "Standard option"),
    platform: item.platform,
    quantity: item.quantity,
    remainingQuantity: Math.max(0, item.quantity - deliveredQuantity - refundedQuantity),
    denomination: face?.amount ?? null,
    denominationCurrency: face?.currency ?? null,
  };
}

export function quotationSelection(items: SupplierQuotationItem[], mode: "remaining" | "all" | "none"): QuotationSelection {
  return Object.fromEntries(items.map(item => [item.id, {
    selected: mode === "all" || (mode === "remaining" && item.remainingQuantity > 0),
    quantity: String(mode === "all" ? item.quantity : item.remainingQuantity || item.quantity),
  }]));
}

export function quotationDiscount(value: string) {
  const raw = value.trim() || "0";
  const percent = Number(raw);
  if (!/^(?:\d{1,3}(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Enter a discount from 0 to 100%, with up to two decimal places.");
  }
  return Math.round(percent * 100);
}

export function quotationMoney(minor: number | null, currency: string | null) {
  if (minor === null || !currency) return "Not specified";
  return currency + " " + (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceQuotationLine(item: SupplierQuotationItem, basisPoints: number): SupplierQuotationLine {
  const face = faceDenomination(item);
  if (!face) {
    if (basisPoints > 0) throw new Error("Face value or currency is missing for " + item.optionName + ". Deselect it to calculate a discounted quotation.");
    return { ...item, faceValueMinor: null, discountMinor: null, supplierTotalMinor: null };
  }
  const faceValueMinor = Math.round((face.amount + Number.EPSILON) * 100) * item.quantity;
  if (!Number.isSafeInteger(faceValueMinor) || faceValueMinor < 0) throw new Error("The quotation amount is too large.");
  // Round the discount once per denomination line, in integer minor units.
  const discountMinor = Number((BigInt(faceValueMinor) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000));
  return { ...item, faceValueMinor, discountMinor, supplierTotalMinor: faceValueMinor - discountMinor };
}

function quotationPriceTotals(lines: SupplierQuotationLine[], key: "discountMinor" | "supplierTotalMinor") {
  const totals = new Map<string, number>();
  let unspecified = false;
  for (const line of lines) {
    const minor = line[key], currency = line.denominationCurrency;
    if (minor === null || !currency) { unspecified = true; continue; }
    const total = (totals.get(currency) ?? 0) + minor;
    if (!Number.isSafeInteger(total)) throw new Error("The quotation amount is too large.");
    totals.set(currency, total);
  }
  const parts = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => quotationMoney(minor, currency));
  if (unspecified) parts.push(parts.length ? "some items not specified" : "Not specified");
  return parts.join(" · ") || "—";
}
export function buildSupplierQuotation(
  orderNumber: string,
  items: SupplierQuotationItem[],
  selection: QuotationSelection,
  supplier: string,
  note: string,
  now = new Date(),
  discount = "0",
): SupplierQuotation {
  const basisPoints = quotationDiscount(discount);
  const lines = items.filter(item => selection[item.id]?.selected).map(item => {
    const raw = selection[item.id].quantity.trim();
    const quantity = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      throw new Error("Enter a whole quantity from 1 to " + item.quantity + " for " + item.optionName + ".");
    }
    return priceQuotationLine({ ...item, quantity }, basisPoints);
  });
  if (!lines.length) throw new Error("Select at least one denomination.");
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  if (!Number.isSafeInteger(totalQuantity)) throw new Error("The total quantity is too large.");
  if (supplier.length > 160 || note.length > 2000) throw new Error("Shorten the supplier name or note.");
  return {
    reference: "SQ-" + orderNumber,
    orderNumber,
    createdAt: now.toISOString(),
    supplier: supplier.trim(),
    note: note.trim(),
    lines,
    totalQuantity,
    discountPercent: basisPoints / 100,
    discountAmount: quotationPriceTotals(lines, "discountMinor"),
    supplierTotal: quotationPriceTotals(lines, "supplierTotalMinor"),
    faceValue: formatFaceValue(lines),
  };
}

export function quotationDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value)) + " IST";
}

export function quotationDenomination(item: SupplierQuotationItem) {
  const face = item.denomination && item.denominationCurrency
    ? item.denomination + " " + item.denominationCurrency : "";
  if (face && Number(item.optionName.trim()) === item.denomination) return face;
  return face && !item.optionName.includes(face) ? item.optionName + " (" + face + ")" : item.optionName;
}

export function quotationText(quote: SupplierQuotation) {
  return [
    "TEJARA GLOBAL · InGamePIN",
    "SUPPLIER QUOTATION REQUEST",
    "Reference: " + quote.reference,
    "Date: " + quotationDate(quote.createdAt),
    ...(quote.supplier ? ["To: " + quote.supplier] : []),
    "",
    "Please confirm availability, the proposed price and delivery time for the following items:",
    "",
    ...quote.lines.map((line, index) => (index + 1) + ". " + line.productName +
      (line.platform ? " · " + line.platform : "") + "\n   " +
      quotationDenomination(line) + " × " + line.quantity + " | Face value: " + formatFaceValue([line]) +
      "\n   Discount (" + quote.discountPercent + "%): " + quotationMoney(line.discountMinor, line.denominationCurrency) +
      " | Supplier total: " + quotationMoney(line.supplierTotalMinor, line.denominationCurrency)),
    "",
    "Total quantity: " + quote.totalQuantity,
    "Total face value: " + quote.faceValue,
    "Discount (" + quote.discountPercent + "%): " + quote.discountAmount,
    "Supplier total after discount: " + quote.supplierTotal,
    ...(quote.note ? ["", "Note: " + quote.note] : []),
    "",
    "Proposed quotation only, subject to supplier confirmation. Discounts are rounded per line.",
  ].join("\n");
}

function csvCell(value: string | number | null) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function quotationCsv(quote: SupplierQuotation) {
  const rows: Array<Array<string | number | null>> = [
    ["TEJARA GLOBAL · InGamePIN", "Supplier quotation request"],
    ["Reference", quote.reference],
    ["Date (IST)", quotationDate(quote.createdAt)],
    ["Supplier", quote.supplier],
    [],
    ["Product", "Platform", "Denomination / option", "Face value per unit", "Currency", "Quantity", "Total face value", "Discount (%)", "Discount amount", "Supplier total"],
    ...quote.lines.map(line => [
      line.productName, line.platform, line.optionName, line.denomination,
      line.denominationCurrency, line.quantity, formatFaceValue([line]), quote.discountPercent,
      quotationMoney(line.discountMinor, line.denominationCurrency), quotationMoney(line.supplierTotalMinor, line.denominationCurrency),
    ]),
    [],
    ["Total quantity", quote.totalQuantity],
    ["Total face value", quote.faceValue],
    ["Discount (%)", quote.discountPercent],
    ["Discount amount", quote.discountAmount],
    ["Supplier total after discount", quote.supplierTotal],
    ["Note", quote.note],
    ["Proposed quotation only, subject to supplier confirmation. Discounts are rounded per line."],
  ];
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

function html(value: string | number) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

export function quotationHtml(quote: SupplierQuotation) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + html(quote.reference) + '</title><style>' +
    '*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#17283b;margin:0;background:#f1f5f9}' +
    'main{max-width:900px;margin:24px auto;padding:32px;background:white;border:1px solid #dbe3ec;border-radius:16px}' +
    '.brand{font-weight:800;letter-spacing:.06em;color:#047c91}.muted{color:#52677d}h1{font-size:26px;margin:12px 0 20px}' +
    '.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-block:1px solid #dbe3ec;padding:14px 0}' +
    'p{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:22px 0;font-size:13px;table-layout:fixed}' +
    'th{background:#eaf5f8;text-align:left}th,td{padding:12px 8px;border-bottom:1px solid #dbe3ec;vertical-align:top;overflow-wrap:anywhere}' +
    'th:first-child{width:32%}th:nth-child(2){width:22%}th:nth-child(3){width:8%}th:nth-child(4){width:19%}th:last-child{width:19%}.right{text-align:right}' +
    'small{display:block}.totals{margin-left:auto;max-width:360px;background:#f1f5f9;padding:14px;border-radius:8px}.totals p{margin:4px 0}' +
    '.note{white-space:pre-wrap}footer{margin-top:26px;font-size:12px;color:#52677d}' +
    'button{border:0;border-radius:8px;background:#165dff;color:white;padding:12px 18px;font-weight:bold;cursor:pointer}' +
    '.toolbar{max-width:900px;margin:16px auto;padding:0 12px}' +
    '@media(max-width:600px){main{margin:12px;padding:16px}h1{font-size:22px}th,td{padding:8px 4px;font-size:11px}}' +
    '@media print{@page{size:A4;margin:14mm}body{background:white}main{margin:0;padding:0;border:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}tr,.totals{break-inside:avoid}h1{font-size:24px}}' +
    '</style></head><body><div class="toolbar"><button id="print-quotation" type="button">Print / Save PDF</button></div><main>' +
    '<div class="brand">TEJARA GLOBAL <span class="muted">· InGamePIN</span></div><h1>Supplier quotation request</h1>' +
    '<div class="meta"><div>Reference<br><strong>' + html(quote.reference) + '</strong></div><div>Date (IST)<br><strong>' +
    html(quotationDate(quote.createdAt)) + '</strong></div></div>' +
    (quote.supplier ? '<p><strong>To:</strong> ' + html(quote.supplier) + '</p>' : '') +
    '<p class="muted">Please confirm availability, the proposed price and delivery time for the following items.</p>' +
    '<p><strong>Discount on face value: ' + html(quote.discountPercent) + '%</strong></p>' +
    '<table><thead><tr><th>Product</th><th>Denomination / option</th><th class="right">Qty</th><th class="right">Face value / discount</th><th class="right">Supplier total</th></tr></thead><tbody>' +
    quote.lines.map(line => '<tr><td><strong>' + html(line.productName) + '</strong>' +
      (line.platform ? '<small>' + html(line.platform) + '</small>' : '') +
      '</td><td>' + html(quotationDenomination(line)) + '</td><td class="right">' + html(line.quantity) +
      '</td><td class="right">' + html(formatFaceValue([line])) + '<small class="muted">Discount: ' + html(quotationMoney(line.discountMinor, line.denominationCurrency)) + '</small></td><td class="right"><strong>' + html(quotationMoney(line.supplierTotalMinor, line.denominationCurrency)) + '</strong></td></tr>').join('') +
    '</tbody></table><div class="totals"><p>Total quantity: <strong>' + html(quote.totalQuantity) +
    '</strong></p><p>Total face value: <strong>' + html(quote.faceValue) + '</strong></p><p>Discount (' + html(quote.discountPercent) + '%): <strong>' + html(quote.discountAmount) + '</strong></p><p>Supplier total: <strong>' + html(quote.supplierTotal) + '</strong></p></div>' +
    (quote.note ? '<p class="note"><strong>Note:</strong><br>' + html(quote.note) + '</p>' : '') +
    '<footer>Proposed quotation only, subject to supplier confirmation. Discounts are rounded per line.</footer></main></body></html>';
}

export function quotationFilename(quote: SupplierQuotation) {
  return quote.reference.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}
