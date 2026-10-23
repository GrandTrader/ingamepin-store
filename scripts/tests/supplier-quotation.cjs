const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", "module", code)(mod.exports, name => imports[name] ?? require(name), mod);
  return mod.exports;
}
const face = load("lib/face-value.ts");
const quote = load("lib/supplier-quotation.ts", { "./face-value": face });
const now = new Date("2026-10-23T10:00:00Z");
const item = (id, amount, quantity, delivered = 0, refunded = 0, currency = "INR") => quote.supplierQuotationItem({
  id, product_name: "Apple Store India", option_name: String(amount), platform: null,
  denomination: amount, quantity, product_options: { denomination_currency: currency },
  customer_information: [{ label: "Password", value: "PRIVATE_PASSWORD" }],
  customer_email: "private@example.com", code: "SECRET_VOUCHER", unit_price: 900.99,
}, delivered, refunded);
function build(items, selection = quote.quotationSelection(items, "remaining"), supplier = "", note = "") {
  return quote.buildSupplierQuotation("IP123", items, selection, supplier, note, now);
}

test("supplier fields exclude customer data, voucher codes and selling prices at the server boundary", () => {
  const row = item("a", 1000, 10);
  assert.deepEqual(Object.keys(row).sort(), ["id", "productName", "optionName", "platform", "quantity", "remainingQuantity", "denomination", "denominationCurrency"].sort());
  for (const output of [quote.quotationText(build([row])), quote.quotationCsv(build([row])), quote.quotationHtml(build([row]))]) {
    for (const secret of ["PRIVATE_PASSWORD", "private@example.com", "SECRET_VOUCHER", "900.99"]) assert(!output.includes(secret));
  }
});

test("remaining defaults subtract delivered and refunded units while full selection remains explicit", () => {
  const rows = [item("a", 100, 10, 4, 2), item("b", 200, 3, 3), item("c", 500, 2, 0, 2)];
  assert.equal(rows[0].remainingQuantity, 4);
  assert.deepEqual(build(rows).lines.map(line => [line.id, line.quantity]), [["a", 4]]);
  assert.equal(build(rows, quote.quotationSelection(rows, "all")).totalQuantity, 15);
  assert.throws(() => build(rows, quote.quotationSelection(rows, "none")), /Select at least one/);
  assert.equal(item("d", 100, 2, 5, 2).remainingQuantity, 0);
});

test("selected denominations use item identity, retain changed quantities and calculate face value only", () => {
  const rows = [item("a", 100, 1500), item("b", 200, 200), item("c", 100, 30)];
  const selection = quote.quotationSelection(rows, "none");
  selection.b = { selected: true, quantity: "10" };
  selection.c = { selected: true, quantity: "20" };
  const result = build(rows, selection);
  assert.equal(result.totalQuantity, 30);
  assert.equal(result.faceValue, "INR 4,000.00");
  assert.deepEqual(result.lines.map(line => line.id), ["b", "c"]);
  assert(!quote.quotationText(result).includes("1500"));
});

test("range snapshots keep their original currency and amount; mixed currencies are never added together", () => {
  const range = quote.supplierQuotationItem({
    id: "r", product_name: "USA range", option_name: "Range - 2.75 USD", platform: null,
    denomination: 999, custom_value: 10, quantity: 3, product_options: { denomination_currency: "INR" },
  }, 0, 0);
  const result = build([range, item("a", 100, 2)]);
  assert.equal(range.denomination, 2.75);
  assert.equal(result.faceValue, "INR 200.00 · USD 8.25");
});

test("unknown face currency stays unspecified instead of using the order selling currency", () => {
  const row = quote.supplierQuotationItem({ id: "a", product_name: "Game", option_name: "Standard PS5", platform: "PS5", denomination: null, quantity: 1 }, 0, 0);
  assert.equal(build([row]).faceValue, "Not specified");
  assert.match(quote.quotationText(build([row])), /Standard PS5/);
});

test("invalid or excessive quantities cannot be exported", () => {
  const rows = [item("a", 100, 10)];
  for (const quantity of ["", "0", "-1", "1.5", "11", "1e1", "Infinity", "NaN", "99999999999999999999"]) {
    assert.throws(() => build(rows, { a: { selected: true, quantity } }), /whole quantity/);
  }
  assert.equal(build(rows, { a: { selected: true, quantity: "10" } }).totalQuantity, 10);
});

test("exports handle Unicode, quotes, formula injection and HTML without interpreting supplier data", () => {
  const rows = [item("a", 100, 2)];
  rows[0].productName = '=HYPERLINK("bad") <img src=x onerror=alert(1)>';
  const result = build(rows, undefined, 'Supplier "A", Тест <script>alert(1)</script>', "@SUM(1)\nSecond line");
  const csv = quote.quotationCsv(result), html = quote.quotationHtml(result);
  assert(csv.startsWith("\uFEFF"));
  assert(csv.includes("\"'=HYPERLINK(\"\"bad\"\")"));
  assert(csv.includes("\"'@SUM(1)\nSecond line\""));
  assert(csv.includes('""A"", Тест'));
  assert(!html.includes("<script>"));
  assert(!html.includes("<img "));
  assert(html.includes("&lt;script&gt;"));
  assert(html.includes('lang="en"'));
  assert.match(quote.quotationDate(result.createdAt), /15:30 IST/);
  assert.equal(quote.quotationFilename(result), "SQ-IP123");
});

test("no sensitive information is embedded in a CSV or printable quote through extra source fields", () => {
  const source = { ...item("a", 1000, 1), code: "PRIVATE_ABC", sale: "$11.22", email: "PRIVATE_MAIL" };
  const result = build([source]);
  for (const render of [quote.quotationText, quote.quotationCsv, quote.quotationHtml]) {
    const output = render(result);
    assert(!output.includes("PRIVATE_ABC") && !output.includes("PRIVATE_MAIL") && !output.includes("$11.22"));
  }
});
