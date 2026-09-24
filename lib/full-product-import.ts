import { UNLIMITED_STOCK_QUANTITY } from "./product-stock";

export const MAX_PRODUCT_IMPORT_BYTES = 512 * 1024;
export const PRODUCT_IMPORT_COLUMNS = [
  "title_en", "title_ru", "description_en", "description_ru", "category_slug",
  "region", "delivery_type", "is_bulk_order", "bulk_delivery_instructions", "slug",
  "denomination_name", "denomination", "currency", "price", "stock_quantity", "is_in_stock",
] as const;

export type ImportCategory = { id: string; name: string; slug: string; category_type: string };
export type ImportedOption = {
  name: string; denomination: number; currency: string; price: number;
  stockQuantity: number; isInStock: boolean;
};
export type FullProductImport = {
  titleEn: string; titleRu: string; descriptionEn: string; descriptionRu: string;
  categorySlug: string; region: string; deliveryType: "MANUAL" | "AUTOMATIC";
  isBulkOrder: boolean; bulkDeliveryInstructions: string; slug: string;
  options: ImportedOption[];
};

const aliases: Record<string, string> = {
  name_en: "title_en", name_ru: "title_ru", description: "description_en",
  name: "denomination_name", option_name: "denomination_name", selling_price: "price", price_usd: "price",
};
const metadataColumns = PRODUCT_IMPORT_COLUMNS.slice(0, 10);

// Quoted fields may contain separators, escaped quotes and real description line breaks.
function readRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, afterQuote = false;
  const finishField = () => { row.push(field.trim()); field = ""; afterQuote = false; };
  const finishRow = () => {
    finishField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > 51) throw new Error("A product can contain at most 50 denominations.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else field += char;
    } else if (char === separator) finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (afterQuote) {
      if (!/\s/.test(char)) throw new Error("Unexpected text after a quoted CSV field.");
    } else if (char === '"') {
      if (field.trim()) throw new Error("Quotes inside a CSV field must be escaped as two quotes.");
      field = ""; quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error("A quoted CSV field is not closed.");
  if (row.length || field || afterQuote) finishRow();
  return rows;
}

function booleanValue(value: string, fallback: boolean, label: string) {
  if (!value) return fallback;
  if (/^(true|yes|1)$/i.test(value)) return true;
  if (/^(false|no|0)$/i.test(value)) return false;
  throw new Error(`${label}: use true or false.`);
}

function wholeNumber(value: string, label: string, minimum: number) {
  if (!/^\d+$/.test(value)) throw new Error(`${label}: enter a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > UNLIMITED_STOCK_QUANTITY) {
    throw new Error(`${label}: value is outside the supported range.`);
  }
  return number;
}

export function parseFullProductCsv(input: string): FullProductImport {
  if (typeof input !== "string" || new TextEncoder().encode(input).length > MAX_PRODUCT_IMPORT_BYTES) {
    throw new Error("Choose a CSV file no larger than 512 KB.");
  }
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) || text.includes("\uFFFD")) {
    throw new Error("Save the file as CSV UTF-8 so English, Russian and emoji are preserved.");
  }
  const headerLine = text.split("\n").find(line => line.trim()) ?? "";
  const separator = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const rows = readRows(text, separator);
  if (rows.length < 2) throw new Error("Include a header and at least one denomination.");
  const headers = rows[0].map(h => aliases[h.toLowerCase()] ?? h.toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column names.");
  const allowed = new Set<string>(PRODUCT_IMPORT_COLUMNS);
  for (const header of headers) {
    if (!allowed.has(header)) throw new Error(`Unknown column "${header}". Use the full-product CSV template.`);
  }
  for (const required of ["title_en", "denomination", "price"]) {
    if (!headers.includes(required)) throw new Error(`Missing column "${required}". Use the full-product CSV template.`);
  }
  const records = rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) throw new Error(`CSV row ${index + 2}: expected ${headers.length} columns; check quoted descriptions.`);
    return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  });
  const first = records[0];
  for (const [index, record] of records.entries()) {
    for (const key of metadataColumns) {
      if (index > 0 && record[key] && record[key] !== first[key]) {
        throw new Error(`CSV row ${index + 2}: "${key}" differs from the first row. Import one product per file.`);
      }
    }
  }
  const titleEn = first.title_en ?? "", titleRu = first.title_ru ?? "";
  if (titleEn.length < 2 || titleEn.length > 150) throw new Error("English title must contain 2–150 characters.");
  if (titleRu && (titleRu.length < 2 || titleRu.length > 150)) throw new Error("Russian title must contain 2–150 characters.");
  const descriptionEn = first.description_en ?? "", descriptionRu = first.description_ru ?? "";
  if (descriptionEn.length > 5000 || descriptionRu.length > 5000) throw new Error("Each description must contain no more than 5,000 characters.");
  const region = first.region || "Global";
  if (region.length < 2 || region.length > 100) throw new Error("Region must contain 2–100 characters.");
  const categorySlug = first.category_slug ?? "";
  if (categorySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) throw new Error("Use the category slug shown below the upload form.");
  const deliveryType = (first.delivery_type || "MANUAL").toUpperCase();
  if (deliveryType !== "MANUAL" && deliveryType !== "AUTOMATIC") throw new Error("Delivery type must be MANUAL or AUTOMATIC.");
  const isBulkOrder = booleanValue(first.is_bulk_order ?? "", false, "Bulk order");
  const bulkDeliveryInstructions = first.bulk_delivery_instructions ?? "";
  if (bulkDeliveryInstructions.length > 2000 || (isBulkOrder && bulkDeliveryInstructions.length < 2)) {
    throw new Error("Bulk orders need delivery instructions of 2–2,000 characters.");
  }
  if (isBulkOrder && deliveryType === "AUTOMATIC") throw new Error("Bulk orders must use MANUAL delivery.");
  const slug = first.slug || titleEn.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
    throw new Error("Provide a slug using lowercase English letters, numbers and hyphens.");
  }
  const options = records.map((record, index): ImportedOption => {
    const label = `CSV row ${index + 2}`;
    const denomination = wholeNumber(record.denomination, `${label} denomination`, 1);
    const currency = (record.currency || first.currency || "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${label}: currency must be a three-letter code such as USD or INR.`);
    const name = record.denomination_name || `${denomination} ${currency}`;
    if (name.length > 150) throw new Error(`${label}: denomination name is too long.`);
    if (!/^\d+(?:\.\d{1,2})?$/.test(record.price) || Number(record.price) > 9999999999.99) {
      throw new Error(`${label}: enter a non-negative USD price with at most two decimal places (for example 1.08).`);
    }
    const stock = record.stock_quantity || "0";
    const stockQuantity = /^unlimited$/i.test(stock) ? UNLIMITED_STOCK_QUANTITY : wholeNumber(stock, `${label} stock quantity`, 0);
    if (deliveryType === "AUTOMATIC" && stockQuantity !== 0) {
      throw new Error(`${label}: automatic delivery stock must be 0; add actual codes in the Stock tab after import.`);
    }
    return { name, denomination, currency, price: Number(record.price), stockQuantity,
      isInStock: booleanValue(record.is_in_stock ?? "", true, `${label} in-stock flag`) };
  });
  if (new Set(options.map(o => o.name.toLowerCase())).size !== options.length) throw new Error("Denomination names must be unique.");
  const finiteStock = options.filter(o => o.stockQuantity !== UNLIMITED_STOCK_QUANTITY).reduce((sum, o) => sum + o.stockQuantity, 0);
  if (finiteStock > UNLIMITED_STOCK_QUANTITY) throw new Error("Combined stock quantity is too large.");
  return { titleEn, titleRu, descriptionEn, descriptionRu, categorySlug, region, deliveryType, isBulkOrder, bulkDeliveryInstructions, slug, options };
}

export function resolveImportCategory(product: FullProductImport, categories: ImportCategory[], selectedId: string) {
  const category = product.categorySlug
    ? categories.find(c => c.slug === product.categorySlug)
    : categories.find(c => c.id === selectedId);
  if (!category) throw new Error(product.categorySlug
    ? `Category "${product.categorySlug}" was not found among active categories.`
    : "Choose a category or include category_slug in your CSV.");
  if (!["GAME_TOPUP", "GAME_KEY", "GIFT_CARD", "SUBSCRIPTION", "DIGITAL_PRODUCT"].includes(category.category_type)) {
    throw new Error("This category has an unsupported product type.");
  }
  return category;
}

export function fullProductTemplate() {
  const headers = ["name", "denomination", "price", "title_en", "title_ru", "description_en", "description_ru"];
  const first = [
    "10 USD", "10", "10.00",
    "Example Gift Card", "Пример подарочной карты",
    "Digital delivery.\nChoose your denomination.", "Цифровая доставка.\nВыберите номинал.",
  ];
  const second = ["25 USD", "25", "25.00", "", "", "", ""];
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return "\uFEFF" + [headers, first, second].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
