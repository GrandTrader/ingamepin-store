const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, imports = {}) {
  const mod = { exports: {} };
  new Function("exports", "require", "module", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod.exports, name => name in imports ? imports[name] : require(name), mod);
  return mod.exports;
}
const fileLib = load("lib/delivery-receipt-file.ts");
const { completeServiceWithReceipt, getAuthorizedDeliveryReceipts } = load("lib/delivery-receipts.ts", { "server-only": {}, "./delivery-receipt-file": fileLib });
const orderId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const receipt = () => new File(["%PDF-1.7 receipt"], "receipt.pdf", { type: "application/pdf" });
function database(options = {}) {
  const calls = [];
  const item = options.item === null ? null : { id: itemId, service_delivered_at: null, orders: { status: options.status || "PROCESSING" }, ...options.item };
  const db = {
    from(table) {
      calls.push(["table", table]);
      const query = { select() { return query; }, eq(...args) { calls.push(["filter", ...args]); return query; },
        maybeSingle: async () => ({ data: item, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: options.rows || [], error: options.queryError || null }).then(resolve, reject); } };
      return query;
    },
    storage: { from(bucket) { assert.equal(bucket, "delivery-receipts"); return {
      upload: async (path, bytes, config) => { calls.push(["upload", path, bytes, config]); return { error: options.uploadError || null }; },
      createSignedUrl: async (path, ttl) => { calls.push(["sign", path, ttl]); return { data: { signedUrl: "https://storage.test/private-receipt" }, error: null }; },
    }; } },
    rpc: async (name, args) => { calls.push(["rpc", name, args]); return { data: { orderStatus: "DELIVERED", alreadyCompleted: false }, error: options.rpcError || null }; },
  };
  return { db, calls };
}
test("JPG, PNG and PDF content is accepted with controlled MIME types", async () => {
  for (const [bytes, type, extension] of [[[255,216,255,1], "image/jpeg", "jpg"], [[137,80,78,71,13,10,26,10], "image/png", "png"], [Buffer.from("%PDF-1.7"), "application/pdf", "pdf"]]) {
    const actual = await fileLib.readDeliveryReceipt(new File([new Uint8Array(bytes)], "untrusted-name", { type }));
    assert.equal(actual.extension, extension); assert.equal(actual.contentType, type);
  }
});
test("HTML/SVG masquerading as an image, MIME mismatches, empty and oversized files are rejected", async () => {
  for (const file of [new File(["<svg onload='x'>"], "fake.png", {type:"image/png"}), new File(["%PDF-1.7"], "fake.jpg", {type:"image/jpeg"}), new File([], "empty.pdf"), new File([new Uint8Array(fileLib.DELIVERY_RECEIPT_MAX_BYTES + 1)], "big.pdf")]) await assert.rejects(fileLib.readDeliveryReceipt(file));
});
test("unpaid, foreign and already completed items cannot trigger uploads or completion", async () => {
  for (const options of [{status:"PENDING"}, {status:"CANCELLED"}, {item:null}, {item:{service_delivered_at:"2026-09-26"}}]) {
    const { db, calls } = database(options);
    await assert.rejects(completeServiceWithReceipt(db, orderId, itemId, adminId, receipt()));
    assert.equal(calls.some(c => ["upload", "rpc"].includes(c[0])), false);
    assert.ok(calls.some(c => c[0] === "filter" && c[1] === "order_id" && c[2] === orderId));
  }
});
test("upload failure never completes the item", async () => {
  const {db,calls}=database({uploadError:{message:"failure"}});
  await assert.rejects(completeServiceWithReceipt(db,orderId,itemId,adminId,receipt()), /upload failed/);
  assert.equal(calls.some(c=>c[0]==="rpc"),false);
});
test("receipt upload uses random private path, then atomic completion", async () => {
  const {db,calls}=database();
  await completeServiceWithReceipt(db,orderId,itemId,adminId,receipt());
  const upload=calls.find(c=>c[0]==="upload"); const rpc=calls.find(c=>c[0]==="rpc");
  assert.ok(upload[1].startsWith(`${orderId}/${itemId}/`)); assert.equal(upload[3].upsert,false);
  assert.equal(rpc[1],"complete_manual_service_with_receipt"); assert.equal(rpc[2].p_receipt_path,upload[1]);
  assert.ok(calls.indexOf(upload)<calls.indexOf(rpc));
});
test("unknown completion response does not report success or delete a potentially committed receipt", async () => {
  const {db}=database({rpcError:{message:"timeout"}});
  await assert.rejects(completeServiceWithReceipt(db,orderId,itemId,adminId,receipt()), /Refresh/);
});
test("customer receipts stay hidden before full completion without any storage query", async () => {
  for(const status of ["PAID","PROCESSING","PENDING","CANCELLED"]) {
    const {db,calls}=database(); assert.equal((await getAuthorizedDeliveryReceipts(db,orderId,status)).size,0); assert.equal(calls.length,0);
  }
});
test("completed-order links are time limited and wrong-order paths are never signed", async () => {
  const {db,calls}=database({rows:[{order_item_id:itemId,storage_path:`${orderId}/${itemId}/receipt.pdf`},{order_item_id:"other",storage_path:"foreign-order/receipt.pdf"}]});
  const links=await getAuthorizedDeliveryReceipts(db,orderId,"DELIVERED");
  assert.equal(links.size,1); assert.ok(links.has(itemId));
  assert.equal(calls.filter(c=>c[0]==="sign").length,1); assert.equal(calls.find(c=>c[0]==="sign")[2],900);
});
test("admin can inspect receipts while other order items remain pending", async () => {
  const {db}=database({rows:[{order_item_id:itemId,storage_path:`${orderId}/${itemId}/receipt.pdf`}]});
  assert.equal((await getAuthorizedDeliveryReceipts(db,orderId,"PROCESSING","admin")).size,1);
});
test("receipt reads occur only after existing order authorization checks", () => {
  for (const [file, guard] of [["app/account/orders/[id]/page.tsx","if (orderResult.error || !orderResult.data)"],["app/api/orders/lookup/route.ts","if (!order || order.customer_email"],["app/api/orders/delivery/route.ts","!hashesMatch("]]) {
    const source=fs.readFileSync(file,"utf8");
    assert.ok(source.indexOf(guard)>0,file); assert.ok(source.indexOf("await getAuthorizedDeliveryReceipts")>source.indexOf(guard),file);
  }
  const sql=fs.readFileSync("supabase/migrations/20260926_230000_manual_delivery_receipts.sql","utf8");
  assert.match(sql,/enable row level security/); assert.match(sql,/revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(sql,/complete_manual_service_item\(p_order_id, p_item_id, p_admin_user_id\)/);
});
