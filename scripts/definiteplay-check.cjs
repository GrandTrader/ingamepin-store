/* Read-only production diagnostic. Credentials travel through SSH stdin, never argv. */
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const settings = parseEnv(fs.readFileSync(path.join(root, '.env.definiteplay.local'), 'utf8').replace(/^\uFEFF/, ''));
const names = ['DEFINITEPLAY_SECURITY_ID','DEFINITEPLAY_API_PASSWORD','DEFINITEPLAY_API_KEY','DEFINITEPLAY_CUSTOMER_ID'];
if (names.some(name => !settings[name]?.trim() || /^your-/i.test(settings[name]))) {
  throw new Error('Complete the private Definite Play configuration first.');
}
const credentials = Object.fromEntries(names.map(name => [name, settings[name]]));
const source = ts.transpileModule(fs.readFileSync(path.join(root,'lib/definiteplay-money.ts'),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

async function remoteCheck(credentials, money) {
  let token = '';
  let lastRequest = 0;
  let lastDt = '';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function request(endpoint, method, body) {
    if (!['session.php','balances.php','fetchstocklist_v2.php'].includes(endpoint)) {
      throw new Error('Only read-only supplier endpoints are permitted.');
    }
    await delay(Math.max(0, 1200 - (Date.now() - lastRequest)));
    let dt = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
    while (dt === lastDt) {
      await delay(200);
      dt = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
    }
    lastDt = dt;
    lastRequest = Date.now();
    const query = new URLSearchParams({dt, cid:credentials.DEFINITEPLAY_CUSTOMER_ID});
    const headers = {'User-Agent':'iGamePIN/1.0', Accept:'application/json'};
    if (token) {
      headers['X-AUTH'] = token;
      headers['X-APIKEY'] = credentials.DEFINITEPLAY_API_KEY;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch('https://definiteplay.co.uk/api/'+endpoint+'?'+query, {
      method, headers, body:body === undefined ? undefined : JSON.stringify(body),
      signal:AbortSignal.timeout(30000), redirect:'error',
    });
    // Deliberately omit response text, URLs and headers from errors.
    if (!response.ok) throw new Error(endpoint+' returned HTTP '+response.status);
    return response.text();
  }
  try {
    token = (await request('session.php','POST',{
      id:credentials.DEFINITEPLAY_SECURITY_ID, password:credentials.DEFINITEPLAY_API_PASSWORD,
    })).trim();
    if (!token || token.includes('<') || token.length > 256) throw new Error('Unexpected authentication response');
    const balances = money.readSupplierBalances(JSON.parse(await request('balances.php','POST')));
    const items = JSON.parse(await request('fetchstocklist_v2.php','GET'));
    if (!Array.isArray(items)) throw new Error('Unexpected stock response');
    const currencies = {};
    const examples = [];
    let invalidPrices = 0;
    for (const item of items) {
      try {
        const price = money.readSupplierPrice(item);
        currencies[price.currency] = (currencies[price.currency] || 0) + 1;
        if (price.currency === 'USD' && examples.length < 3 && /apple|razer|playstation/i.test(item.product)) {
          examples.push({sku:item.sku,product:item.product,cardCurrency:item.cardcurrency,supplierPrice:price});
        }
      } catch { invalidPrices += 1; }
    }
    console.log(JSON.stringify({
      checkedAt:new Date().toISOString(), authentication:'success',
      balances, stockProducts:items.length, supplierPriceCurrencies:currencies,
      invalidPrices, examples, ordersPlaced:0,
    },null,2));
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Connection failed';
    for (const value of [...Object.values(credentials),token]) {
      if (value) message = message.split(value).join('[REDACTED]');
    }
    console.log(JSON.stringify({error:message.slice(0,250),ordersPlaced:0}));
    process.exitCode = 1;
  }
}
const remote = 'const mod={exports:{}};\n' +
  '(function(exports,module){\n'+source+'\n})(mod.exports,mod);\n' +
  '('+remoteCheck.toString()+')('+JSON.stringify(credentials)+',mod.exports);';
const ssh = process.platform === 'win32' ? 'C:/Windows/System32/OpenSSH/ssh.exe' : 'ssh';
const host = process.env.DEFINITEPLAY_SSH_HOST || 'root@187.127.167.138';
const key = process.env.DEFINITEPLAY_SSH_KEY || path.resolve(root,'../non-website-files/.codex-vps-access/id_ed25519');
const result = spawnSync(ssh,[
  '-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes',
  '-i',key,host,'/opt/signal-bots/runtime/bin/node -',
],{input:remote,encoding:'utf8',timeout:110000,maxBuffer:1024*1024});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if(result.error) console.error('SSH check failed: '+result.error.code);
process.exitCode = result.status ?? 1;
