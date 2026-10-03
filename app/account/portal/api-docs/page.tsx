import Link from "next/link";
import { portalCustomer } from "@/lib/business-portal-data";
import s from "../Portal.module.css";

const endpoints = [
  ["GET", "/products?page=1&region=India", "Active business products, denominations, base USD prices, your discount percentage, and supported custom-value ranges. 20 products per page."],
  ["GET", "/stock?optionIds=OPTION_UUID", "Current availability and quantity limits for up to 100 comma-separated option IDs. availableQuantity: null means there is no fixed stock limit."],
  ["GET", "/wallet", "Your shared USD wallet balance and whether wallet payments are enabled."],
  ["POST", "/orders/quote", "Check current prices, discounts, stock, limits and wallet balance. Does not charge your wallet."],
  ["POST", "/orders", "Confirm the reviewed order and pay from your wallet. Requires a key with ordering permission."],
  ["GET", "/orders?page=1", "Your business orders, 20 per page. Follow nextPage until it is null."],
  ["GET", "/orders/ORDER_UUID", "Order status, amounts and ordered items."],
  ["GET", "/orders/ORDER_UUID/codes", "Delivered codes grouped by order item. Pending or partially delivered items can have fewer codes than the ordered quantity."],
];

export default async function BusinessApiDocs() {
  await portalCustomer();
  return <div className={s.apiStack}>
    <div className={s.titleLine}><h2>Customer ordering API</h2><Link className={s.primary} href="/account/portal/api-access">Manage API keys</Link></div>
    <section className={s.card}><h3 className={s.sectionTitle}>Connection</h3><p>Base URL: <code>https://www.ingamepin.com/api/v1/business</code></p>
      <p className={s.helper}>Use your localhost address during local preview. Confirmation uses the connected wallet; localhost does not create a separate test balance.</p>
      <pre>{`Authorization: Bearer YOUR_API_KEY\nContent-Type: application/json`}</pre>
      <p>Keep your key on your server. Add its outgoing public IP in API access. Keys expire and can be revoked at any time. Limit: 120 requests per minute per key.</p>
    </section>
    <section className={s.card}><h3 className={s.sectionTitle}>Endpoints</h3>{endpoints.map(([method,path,description])=><div key={method+path} className={s.apiEndpoint}><p><strong>{method}</strong> <code>{path}</code></p><p className={s.muted}>{description}</p></div>)}</section>
    <section className={s.card}><h3 className={s.sectionTitle}>Place an order</h3>
      <p>1. Load products and choose an option ID. Request a quote with a new UUID as the Idempotency-Key header.</p>
      <pre>{`POST /orders/quote\nIdempotency-Key: 123e4567-e89b-42d3-a456-426614174000\n\n{\n  "reference": "MY-ORDER-1001",\n  "items": [{ "productOptionId": "OPTION_UUID", "quantity": 2 }]\n}`}</pre>
      <p>The response contains <code>result.total</code>, <code>result.walletBalance</code>, <code>result.balanceAfter</code> and the priced items. Catalogue prices are estimates; the quote is authoritative.</p>
      <p className={s.helper}>For an enabled denomination range, include customValue. Products requiring delivery information must include the required customerInformation or playerId.</p>
      <pre>{`"customerInformation": [{ "fieldId": "FIELD_UUID", "value": "Customer value" }]`}</pre>
      <p className={s.helper}>Use customerFields from the catalogue to get the field IDs, labels, types and required flags. Include playerId when the product requires it.</p>
      <p>2. Confirm using the same reference, items and Idempotency-Key, with the quoted total as expectedTotal.</p>
      <pre>{`POST /orders\nIdempotency-Key: 123e4567-e89b-42d3-a456-426614174000\n\n{\n  "reference": "MY-ORDER-1001",\n  "expectedTotal": 19.50,\n  "items": [{ "productOptionId": "OPTION_UUID", "quantity": 2 }]\n}`}</pre>
      <p>Confirmation charges the wallet and returns <code>result.orderId</code>. If the connection fails, retry the identical confirmation with the same key. A committed order is returned again without another charge. Never create a new key just to retry an uncertain payment.</p>
      <p className={s.helper}>If prices or stock change, a new quote may be required. Use a new request UUID only after the earlier attempt is confirmed unsuccessful.</p>
      <p>3. Poll the order and codes endpoints every 10–30 seconds until delivery completes. Store codes securely and avoid logging them.</p>
    </section>
    <section className={s.card}><h3 className={s.sectionTitle}>Errors</h3><p>400: invalid input · 401: missing key · 403: access or IP denied · 404: unavailable resource · 409: price, stock, balance or order conflict · 429: rate limit (respect Retry-After) · 503: temporarily unavailable.</p><p className={s.helper}>An error response contains an error message. Order and code endpoints only return data belonging to your business account.</p></section>
  </div>;
}
