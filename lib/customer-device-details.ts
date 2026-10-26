import { userAgent } from "next/server";

export type CustomerDeviceDetails = {
  device_type: string | null;
  os: string | null;
  browser: string | null;
  brand: string | null;
  model: string | null;
  model_source: "client-hint" | "user-agent" | null;
};

const clean = (value: unknown, max = 100) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) || null
  : null;
function quotedHint(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value || value.length > 220 || !value.startsWith('"')) return null;
  try { return clean(JSON.parse(value)); } catch { return null; }
}

// These are browser-reported clues, never hardware identifiers or proof of identity.
export function customerDeviceDetails(headers: Headers): CustomerDeviceDetails {
  const ua = clean(headers.get("user-agent"), 600) || "";
  const parsed = userAgent({ headers: new Headers({ "user-agent": ua }) });
  const platform = quotedHint(headers, "sec-ch-ua-platform");
  const os = platform || clean(parsed.os.name);
  const hint = quotedHint(headers, "sec-ch-ua-model");
  let model = hint || clean(parsed.device.model);
  // Reduced Android user agents use K as a placeholder. Generic Apple names are not models.
  if (model && /^(K|iPhone|iPad|Macintosh|Mac|unknown)$/i.test(model)) model = null;
  let brand = clean(parsed.device.vendor);
  if (hint && model) {
    // Do not carry an unrelated vendor from a reduced/spoofed user-agent into a hint model.
    brand = /^SM-|^GT-/i.test(model) ? "Samsung" : /^Pixel(?:\s|$)/i.test(model) ? "Google" : null;
  }
  const browser = parsed.browser.name
    ? clean(parsed.browser.name + (parsed.browser.major ? " " + parsed.browser.major : "")) : null;
  const type = parsed.isBot ? "Automated client" : clean(parsed.device.type)
    || (headers.get("sec-ch-ua-mobile") === "?1" ? "mobile" : null)
    || (os && /^(Windows|macOS|Mac OS|Linux|Ubuntu|Chrome OS|Chromium OS)$/i.test(os) ? "Computer (desktop/laptop)" : null);
  return { device_type: type, os, browser, brand, model, model_source: model ? hint ? "client-hint" : "user-agent" : null };
}

// Report data may come from old rows; discard unexpected keys and bound every value.
export function normalizeCustomerDeviceDetails(value: unknown): CustomerDeviceDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return { device_type: clean(v.device_type), os: clean(v.os), browser: clean(v.browser), brand: clean(v.brand), model: clean(v.model), model_source: v.model_source === "client-hint" || v.model_source === "user-agent" ? v.model_source : null };
}
