/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}) {
  const output = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', js)(output, name => Object.hasOwn(mocks, name) ? mocks[name] : require(name));
  return output;
}
process.env.GAME_ACCOUNT_DETAILS_KEY = 'test-only-key-'.repeat(5);
const crypto = load('lib/account-detail-crypto.ts', { 'server-only': {} });
const sensitive = load('lib/sensitive-customer-fields.ts');
const buyer = randomUUID(), product = randomUUID(), field = randomUUID(), item = randomUUID();
const user = { id: buyer, email_confirmed_at: new Date().toISOString() };
let signedIn = true, mfa = true, administrator = true, limited = false, saved = [], inserts = 0, reveals = 0, available = true;
const client = { auth: { getUser: async () => ({ data: { user: signedIn ? user : null } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: administrator ? { user_id: buyer } : null }) }) }) }) };
const admin = {
  from: table => ({
    select: () => ({ eq: () => table === 'products' ? { maybeSingle: async () => ({ data: { id: product, status: 'ACTIVE' } }) } : Promise.resolve({ data: [{ id: field, label: 'Login Password', is_required: true }] }) }),
    insert: async rows => { inserts++; saved = rows; return { error: available ? null : { code: 'missing' } }; },
  }),
  rpc: async () => { reveals++; return { data: available ? saved[0] : null }; },
};
const mocks = {
  '@/lib/supabase/server': { createClient: async () => client },
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/admin-assurance': { hasRequiredAdminAssurance: async () => mfa },
  '@/lib/account-detail-crypto': crypto,
  '@/lib/sensitive-customer-fields': sensitive,
  '@/lib/request-security': { consumeRate: async () => !limited, privateJson: (body, status = 200) => Response.json(body, { status }), sameOrigin: request => request.headers.get('origin') === 'https://store.example' },
};
const capture = load('app/api/account/protected-details/route.ts', mocks).POST;
const reveal = load('app/api/admin/protected-details/route.ts', mocks).POST;
const request = (body, origin = 'https://store.example') => new Request('https://store.example/api/protected', { method: 'POST', headers: origin ? { Origin: origin } : {}, body: JSON.stringify(body) });
const secret = '  Synthetic password!  ';
const submission = { productId: product, authorized: true, units: [{ [field]: secret }] };
const read = { orderItemId: item, fieldId: field };
(async () => {
  for (const origin of [null, 'https://elsewhere.example']) {
    assert.equal((await capture(request(submission, origin))).status, 403);
    assert.equal((await reveal(request(read, origin))).status, 403);
  }
  signedIn = false;
  assert.equal((await capture(request(submission))).status, 401);
  assert.equal((await reveal(request(read))).status, 401);
  signedIn = true; user.email_confirmed_at = null;
  assert.equal((await capture(request(submission))).status, 401);
  user.email_confirmed_at = new Date().toISOString();
  assert.equal((await capture(request({ ...submission, authorized: false }))).status, 400);
  assert.equal((await capture(request({ ...submission, units: [{ unknown: secret }] }))).status, 400);
  limited = true;
  assert.equal((await capture(request(submission))).status, 429);
  assert.equal((await reveal(request(read))).status, 429);
  limited = false; mfa = false;
  assert.equal((await reveal(request(read))).status, 401);
  mfa = true; administrator = false;
  assert.equal((await reveal(request(read))).status, 403);
  assert.equal(inserts, 0); assert.equal(reveals, 0);
  administrator = true;
  const captured = await capture(request(submission));
  assert.equal(captured.status, 200);
  const json = await captured.json();
  assert(sensitive.PROTECTED_REFERENCE.test(json.references[0][field]));
  assert(!JSON.stringify(saved).includes(secret));
  assert(!JSON.stringify(json).includes(secret));
  assert.equal(crypto.decryptAccountDetail(saved[0].ciphertext, crypto.accountDetailBinding(saved[0].id, buyer, product, field)), secret);
  const response = await reveal(request(read));
  assert.equal(response.status, 200); assert.equal((await response.json()).value, secret);
  available = false;
  assert.equal((await capture(request(submission))).status, 503);
  assert.equal((await reveal(request(read))).status, 409);
  const clientApi = load('lib/protected-detail-client.ts', { './sensitive-customer-fields': sensitive });
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => Response.json({ references: [{ [field]: secret }] });
    await assert.rejects(() => clientApi.captureProtectedDetails(product, true, submission.units));
    global.fetch = async () => Response.json({ references: [{ [field]: json.references[0][field], extra: secret }] });
    assert.deepEqual(await clientApi.captureProtectedDetails(product, true, submission.units), [{ [field]: json.references[0][field] }]);
  } finally { global.fetch = previousFetch; }
  const descriptions = load('lib/game-account-description.ts');
  const legacy = '📧 Required: Your PlayStation account email and PSN Online ID.';
  assert.equal(descriptions.gameAccountDescription(legacy, false), legacy);
  assert(descriptions.gameAccountDescription(legacy, true).includes('backup/recovery'));
  assert.equal(descriptions.gameAccountDescription('Merchant custom description', true), 'Merchant custom description');
  console.log('Protected-detail routes passed: origin, verified login, consent, rate limits, admin MFA, encrypted storage, private reveal, unavailable storage, opaque-reference validation and descriptive copy.');
})().catch(error => { console.error(error); process.exitCode = 1; });
