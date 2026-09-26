const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, imports = {}) {
  const mod = { exports: {} };
  new Function("exports", "require", "module", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod.exports, name => name in imports ? imports[name] : require(name), mod);
  return mod.exports;
}
const currencies = load("lib/purchase-restriction-currencies.ts");
const { regionalFaceValue, exceedsRegionalLimit } = load("lib/regional-purchase-limit.ts", { "./purchase-restriction-currencies": currencies });
const item = (denomination, currency, quantity = 1) => ({ denomination, currency, quantity });
test("regional limits count face value regardless of discount or selling price", () => {
  assert.equal(regionalFaceValue([{ ...item(100, "USD", 5), sellingPrice: 93, total_price: 465 }], "USD"), 500);
  assert.equal(exceedsRegionalLimit(400, 100, 500), false);
  assert.equal(exceedsRegionalLimit(400, 101, 500), true);
});
test("INR, TRY, EUR and AED keep their original denomination units", () => {
  for (const currency of ["INR", "TRY", "EUR", "AED"]) assert.equal(regionalFaceValue([item(250, currency, 3)], currency), 750);
});
test("mixed-region carts count only denominations in the selected currency", () => {
  assert.equal(regionalFaceValue([item(100, "USD", 2), item(1000, "TRY", 4)], "TRY"), 4000);
  assert.equal(regionalFaceValue([item(1000, "TRY")], "USD"), 0);
});
test("multiple lines and historical quantities count cumulatively", () => {
  const previous = regionalFaceValue([item(100, "USD", 2), item(50, "USD", 3)], "USD");
  const current = regionalFaceValue([item(100, "USD"), item(100, "USD")], "USD");
  assert.equal(exceedsRegionalLimit(previous, current, 500), true);
});
test("decimal and three-decimal currencies do not cause boundary rounding errors", () => {
  assert.equal(exceedsRegionalLimit(0.1, 0.2, 0.3), false);
  assert.equal(regionalFaceValue([item(1.125, "KWD", 3)], "KWD"), 3.375);
});
test("unknown currencies and missing historic denomination data fail closed", () => {
  for (const row of [item(10, null), item(null, "USD"), item("", "USD"), item(-1, "USD"), item(5, "USD", 0), item(5, "USD", 1.2)]) assert.throws(() => regionalFaceValue([row], "USD"));
  assert.throws(() => regionalFaceValue([], "ZZZ"));
  assert.throws(() => exceedsRegionalLimit(0, 5, NaN));
});
test("database and form support the same currency set", () => {
  const sql = fs.readFileSync("supabase/migrations/20260926_220000_regional_restriction_currencies.sql", "utf8");
  const sqlCodes = [...sql.matchAll(/'([A-Z]{3})'/g)].map(match => match[1]);
  assert.deepEqual(sqlCodes, currencies.restrictionCurrencies.map(c => c.code));
  for (const code of ["INR", "USD", "TRY", "EUR", "GBP", "AED", "SAR", "CAD", "AUD", "JPY", "SGD", "BRL", "ZAR"]) assert.equal(currencies.isRestrictionCurrency(code), true);
});
