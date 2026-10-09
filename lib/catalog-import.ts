// Shared CSV validation. The server repeats this validation before every import.
export const MAX_CATALOG_BYTES = 512 * 1024;
export const CATALOG_COLUMNS = ["parent_sku", "sku", "title_en", "title_ru", "slug", "category_slug", "region", "description_en", "description_ru", "option_name", "platform", "store_price_inr", "price", "store_url", "price_checked_at", "availability", "is_preorder", "release_date", "sale_ends_at", "image_url", "customer_fields", "publication_status", "delivery_instructions", "is_featured", "affiliate_enabled", "affiliate_commission_percent"] as const;
export type CatalogColumn = typeof CATALOG_COLUMNS[number];
export type CatalogSettings = { markup_percent: string; inr_per_usd: string };
export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = { markup_percent: "20", inr_per_usd: "98" };
export const GAME_MARKUP_POLICY = "inr_game_tiers_v1";
export type CsvRecord = Record<string, string>;
export type CatalogIssue = { row: number; sku: string; error: string; values: CsvRecord };
export type CatalogGame = { parent_sku: string; product: CsvRecord; editions: CatalogEdition[]; rows: number[] };
export type CatalogEdition = { sku: string; option_name?: string; platform?: string; store_price_inr?: string; price?: string; source: CsvRecord; row: number; warnings: string[] };
const aliases: Record<string, string> = { product_title: "title_en", name: "title_en", name_ru: "title_ru", description: "description_en", edition: "option_name", selling_price_usd: "price", selling_price: "price" };
const productKeys = ["title_en", "title_ru", "slug", "category_slug", "region", "description_en", "description_ru", "image_url", "customer_fields", "delivery_instructions", "is_featured", "affiliate_enabled", "affiliate_commission_percent"];
const skuPattern = /^[A-Z0-9][A-Z0-9._-]{1,99}$/;

export function decimalUnits(value: string, places: number, label: string): bigint {
  if (!new RegExp(`^\\d{1,10}(?:\\.\\d{1,${places}})?$`).test(value)) throw new Error(`${label}: enter a positive decimal with at most ${places} decimal places.`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10 ** places) + BigInt(fraction.padEnd(places, "0"));
}
export function validateCatalogSettings(settings: CatalogSettings) {
  const markup = decimalUnits(String(settings.markup_percent), 2, "Markup");
  const rate = decimalUnits(String(settings.inr_per_usd), 4, "INR per USD");
  if (markup > BigInt(100000) || rate <= BigInt(0) || rate > BigInt(100000000)) throw new Error("Markup must be 0–1000% and INR per USD must be greater than 0 and at most 10,000.");
  return { markup, rate };
}
export function calculateCatalogPrice(inr: string, settings: CatalogSettings): string {
  const paise = decimalUnits(inr, 2, "India Store price");
  if (paise <= BigInt(0) || paise > BigInt(100000000)) throw new Error("India Store price must be greater than 0 and at most 1,000,000 INR.");
  const { markup, rate } = validateCatalogSettings(settings);
  // INR paise × (100% + basis points) / rate at four decimal places = USD cents.
  const numerator = paise * (BigInt(10000) + markup);
  const cents = (numerator + rate / BigInt(2)) / rate;
  if (cents < BigInt(1)) throw new Error("Calculated selling price must be at least $0.01.");
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

// Use the current official edition price, before conversion, to select its markup.
export function gameMarkupPercent(inr: string): "50" | "30" | "20" {
  const paise = decimalUnits(inr, 2, "India Store price");
  if (paise <= BigInt(0) || paise > BigInt(100000000)) throw new Error("India Store price must be greater than 0 and at most 1,000,000 INR.");
  return paise < BigInt(50000) ? "50" : paise <= BigInt(200000) ? "30" : "20";
}

export function calculateGameCatalogPrice(inr: string, inrPerUsd: string): string {
  return calculateCatalogPrice(inr, { markup_percent: gameMarkupPercent(inr), inr_per_usd: inrPerUsd });
}

export function readCatalogCsv(input: string): string[][] {
  if (typeof input !== "string" || new TextEncoder().encode(input).length > MAX_CATALOG_BYTES) throw new Error("Upload a UTF-8 CSV no larger than 512 KB.");
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(text)) throw new Error("Invalid text encoding. Save as CSV UTF-8.");
  const first = text.split("\n")[0];
  const separator = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, ended = false;
  const cell = () => { row.push(field.trim()); field = ""; ended = false; };
  const line = () => { cell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 2001) throw new Error("Maximum 2,000 edition rows per file."); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; ended = true; } } else field += c; }
    else if (c === separator) cell();
    else if (c === "\n") line();
    else if (ended) { if (!/\s/.test(c)) throw new Error("Unexpected content after a quoted field."); }
    else if (c === '"') { if (field.trim()) throw new Error("Escape quotes as two quotation marks inside a quoted field."); quoted = true; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("A quoted CSV field is not closed.");
  if (row.length || field || ended) line();
  if (rows.length < 2) throw new Error("Include a header and at least one edition row.");
  if (new Set(rows[0]).size !== rows[0].length || rows[0].some(h => !h)) throw new Error("Headers must be unique and non-empty.");
  return rows;
}
export function defaultColumnMapping(headers: string[]): Record<string, string> {
  return Object.fromEntries(headers.map(h => { const key = h.toLowerCase().trim(); return [h, aliases[key] ?? (CATALOG_COLUMNS.includes(key as CatalogColumn) ? key : "")]; }));
}
function timestamp(value: string, key: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${key}: use an ISO timestamp with timezone, for example 2026-10-08T06:00:00Z.`);
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error(`${key}: invalid calendar date.`);
}
export function isOfficialStoreUrl(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "store.playstation.com" && !u.username && !u.password && !u.port && /^\/en-in\/(product\/[A-Z0-9_-]+|concept\/\d+)\/?$/.test(u.pathname); } catch { return false; }
}

export function parseCatalogImport(csv: string, mapping: Record<string, string>, settings: CatalogSettings, now = Date.now()) {
  validateCatalogSettings(settings);
  const rows = readCatalogCsv(csv), headers = rows[0];
  const targets = headers.map(h => mapping[h] || "").filter(Boolean);
  if (new Set(targets).size !== targets.length || targets.some(t => !CATALOG_COLUMNS.includes(t as CatalogColumn))) throw new Error("Map each supported product field only once.");
  if (!["parent_sku", "sku"].every(k => targets.includes(k))) throw new Error("Map parent_sku and sku before previewing.");
  const games = new Map<string, CatalogGame>(), errors: CatalogIssue[] = [], seen = new Set<string>(), duplicateSkus = new Set<string>();
  const parsed: { values: CsvRecord; row: number }[] = rows.slice(1).map((r, i) => ({ row: i + 2, values: Object.fromEntries(headers.map((h, j) => [mapping[h] || "_ignored", r[j] || ""])) }));
  for (const { values } of parsed) { const sku = values.sku?.toUpperCase(); if (seen.has(sku)) duplicateSkus.add(sku); seen.add(sku); }
  for (const [index, record] of parsed.entries()) {
    const { values: v, row } = record;
    try {
      if (rows[index + 1].length !== headers.length) throw new Error("Column count differs from the header. Check quoted multiline descriptions.");
      const parent = (v.parent_sku || "").toUpperCase(), sku = (v.sku || "").toUpperCase();
      if (!skuPattern.test(parent) || !skuPattern.test(sku) || parent === sku) throw new Error("Parent and edition SKUs must be distinct, 2–100 letters/numbers/dots/hyphens/underscores.");
      if (duplicateSkus.has(sku)) throw new Error("Edition SKU is duplicated in this file. Every occurrence has been rejected.");
      if (v.publication_status && v.publication_status.toUpperCase() !== "DRAFT") throw new Error("Imports cannot publish products. Use DRAFT.");
      for (const k of ["title_en", "title_ru", "option_name"]) if (v[k] && (v[k].length < 2 || v[k].length > 150)) throw new Error(`${k}: use 2–150 characters.`);
      for (const k of ["description_en", "description_ru", "delivery_instructions"]) if (v[k]?.length > 5000 || /<[^>]+>/.test(v[k] || "")) throw new Error(`${k}: use plain text up to 5,000 characters.`);
      for (const k of ["is_featured", "affiliate_enabled"]) if (v[k]) {
        if (!["true", "false"].includes(v[k].toLowerCase())) throw new Error(`${k}: use true or false.`);
        v[k] = v[k].toLowerCase();
      }
      if (v.affiliate_commission_percent && decimalUnits(v.affiliate_commission_percent, 2, "Affiliate commission") > BigInt(2500)) throw new Error("Affiliate commission must be between 0% and 25%.");
      if (v.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug) || v.slug.length > 180)) throw new Error("Use a lowercase slug with letters, digits and hyphens.");
      if (v.region && v.region !== "India") throw new Error("This purchase-assistance importer supports region India.");
      if (v.platform && !["PS4", "PS5", "PS4/PS5"].includes(v.platform)) throw new Error("Platform must be PS4, PS5 or PS4/PS5.");
      if (v.customer_fields && !["PSN_EMAIL_AND_ID", "GAME_ACCOUNT_DETAILS"].includes(v.customer_fields)) throw new Error("Use GAME_ACCOUNT_DETAILS for the Games customer-field preset.");
      if (v.store_url && !isOfficialStoreUrl(v.store_url)) throw new Error("Use an official https://store.playstation.com/en-in/product/... or concept/... URL.");
      if (v.image_url) { const u = new URL(v.image_url); if (u.protocol !== "https:" || u.username || u.password) throw new Error("Use an HTTPS image URL you have permission to use."); }
      if (v.availability && !["AVAILABLE", "PREORDER", "UNAVAILABLE", "UNVERIFIED"].includes(v.availability)) throw new Error("Availability must be AVAILABLE, PREORDER, UNAVAILABLE or UNVERIFIED.");
      if (v.is_preorder && !["true", "false"].includes(v.is_preorder.toLowerCase())) throw new Error("is_preorder must be true or false.");
      for (const k of ["price_checked_at", "sale_ends_at", "release_date"]) if (v[k]) timestamp(v[k], k);
      if (v.price_checked_at && Date.parse(v.price_checked_at) > now + 300000) throw new Error("Price verification cannot be in the future.");
      if (v.is_preorder?.toLowerCase() === "true" && v.availability && v.availability !== "PREORDER") throw new Error("A preorder must have PREORDER availability.");
      if (v.availability === "PREORDER" && v.is_preorder?.toLowerCase() === "false") throw new Error("PREORDER availability cannot use is_preorder=false.");
      const warnings: string[] = [];
      const price = v.store_price_inr ? calculateGameCatalogPrice(v.store_price_inr, settings.inr_per_usd) : undefined;
      if (v.price) { decimalUnits(v.price, 2, "Supplied USD price"); if (!price) throw new Error("Provide store_price_inr when supplying a USD price."); if (Number(v.price) !== Number(price)) warnings.push(`Supplied $${v.price} will be replaced with calculated $${price}.`); }
      if (v.sale_ends_at && Date.parse(v.sale_ends_at) <= now) warnings.push("Sale expired. Purchases remain blocked until the price is rechecked.");
      if (v.availability === "UNVERIFIED" || !v.store_price_inr || !v.price_checked_at || !v.store_url) warnings.push("New editions require a verified public INR price and source before purchases can be accepted.");
      if (!v.image_url) warnings.push("Review the product image; upload manually if needed.");
      const product: CsvRecord = Object.fromEntries(productKeys.filter(k => v[k]).map(k => [k, v[k]]));
      let game = games.get(parent);
      if (!game) { game = { parent_sku: parent, product: {}, editions: [], rows: [] }; games.set(parent, game); }
      for (const [k, value] of Object.entries(product)) if (game.product[k] && game.product[k] !== value) throw new Error(`Conflicting ${k} for parent ${parent}.`);
      Object.assign(game.product, product);
      const source = Object.fromEntries(["store_url", "price_checked_at", "availability", "is_preorder", "release_date", "sale_ends_at"].filter(k => v[k]).map(k => [k, v[k]]));
      if (v.store_price_inr) { source.store_price_inr = v.store_price_inr; source.markup_percent = gameMarkupPercent(v.store_price_inr); source.markup_policy = GAME_MARKUP_POLICY; source.inr_per_usd = settings.inr_per_usd; source.sale_ends_at = v.sale_ends_at || ""; }
      game.editions.push({ sku, ...(v.option_name ? { option_name: v.option_name } : {}), ...(v.platform ? { platform: v.platform } : {}), ...(price ? { price, store_price_inr: v.store_price_inr } : {}), source, row, warnings }); game.rows.push(row);
    } catch (error) { errors.push({ row, sku: v.sku || "", error: error instanceof Error ? error.message : "Invalid row.", values: v }); }
  }
  return { games: [...games.values()].filter(g => g.editions.length), errors, rowCount: parsed.length };
}
export function catalogCsv(headers: readonly string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => { let s = String(v); if (/^[=+@\t\r-]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  return "\uFEFF" + [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
export function catalogTemplate() {
  return catalogCsv(CATALOG_COLUMNS, [["PS-IN-EXAMPLE", "PS-IN-EXAMPLE-STANDARD", "Example game — PS5 India — Purchase Assistance", "Пример игры — PS5 Индия — Помощь в покупке", "example-game-ps5-india", "", "India", "Replace with your verified game description.", "Замените описанием проверенной игры.", "Standard Edition", "PS5", "", "", "", "", "UNVERIFIED", "false", "", "", "", "PSN_EMAIL_AND_ID", "DRAFT", "", "true", "true", "3"]]);
}
