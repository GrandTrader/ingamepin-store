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
function build(items, selection = quote.quotationSelection(items, "remaining"), supplier = "", note = "", discount = "0") {
  return quote.buildSupplierQuotation("IP123", items, selection, supplier, note, now, discount);
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

test("a single supplier discount updates selected lines and all export totals", () => {
  const rows = [item("a", 1000, 10), item("b", 500, 20)];
  const selection = quote.quotationSelection(rows, "none");
  selection.a = { selected: true, quantity: "10" };
  const result = build(rows, selection, "", "", "7.25");
  assert.equal(result.discountPercent, 7.25);
  assert.equal(result.faceValue, "INR 10,000.00");
  assert.equal(result.discountAmount, "INR 725.00");
  assert.equal(result.supplierTotal, "INR 9,275.00");
  assert.equal(result.lines[0].discountMinor, 72500);
  for (const render of [quote.quotationText, quote.quotationCsv, quote.quotationHtml]) {
    const output = render(result);
    assert(output.includes("7.25"));
    assert(output.includes("INR 725.00"));
    assert(output.includes("INR 9,275.00"));
    assert(!output.includes("INR 20,000.00"));
  }
});

test("discount rounding is per line and totals reconcile in each currency separately", () => {
  const result = build([item("a", 2.75, 3, 0, 0, "USD"), item("b", 100, 2)], undefined, "", "", "5");
  assert.equal(result.lines[0].faceValueMinor, 825);
  assert.equal(result.lines[0].discountMinor, 41);
  assert.equal(result.lines[0].supplierTotalMinor, 784);
  assert.equal(result.discountAmount, "INR 10.00 · USD 0.41");
  assert.equal(result.supplierTotal, "INR 190.00 · USD 7.84");
  for (const line of result.lines) assert.equal(line.faceValueMinor - line.discountMinor, line.supplierTotalMinor);
  const halfCent = build([item("c", 0.10, 1)], undefined, "", "", "5");
  assert.equal(halfCent.lines[0].discountMinor, 1, "Half cents round up");
  const large = build([item("d", 10000000000, 100)], undefined, "", "", "99.99");
  assert.equal(large.lines[0].discountMinor, 99990000000000);
});

test("zero, fractional and full discounts are valid, and invalid discounts are rejected", () => {
  const rows = [item("a", 100, 10)];
  assert.equal(build(rows).supplierTotal, "INR 1,000.00");
  assert.equal(build(rows, undefined, "", "", ".5").supplierTotal, "INR 995.00");
  assert.equal(build(rows, undefined, "", "", "100").supplierTotal, "INR 0.00");
  assert.equal(build(rows, undefined, "", "", "").discountPercent, 0);
  for (const discount of ["-1", "100.01", "101", "0.001", "NaN", "Infinity", "5%", "1e1"]) {
    assert.throws(() => build(rows, undefined, "", "", discount), /discount from 0 to 100/);
  }
});

test("missing face value cannot silently disappear from a discounted supplier total", () => {
  const missing = quote.supplierQuotationItem({ id: "b", product_name: "Game", option_name: "PS5", platform: "PS5", quantity: 1 }, 0, 0);
  assert.throws(() => build([item("a", 100, 1), missing], undefined, "", "", "5"), /Face value or currency is missing for PS5/);
  assert.equal(build([missing]).supplierTotal, "Not specified");
});
