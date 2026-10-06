// Default: read-only preflight. --enable activates after the website is deployed.
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const flag = process.argv[2] || '--check';
if (!['--check','--enable','--disable'].includes(flag)) throw Error('Use --check, --enable or --disable');
const payload = {mode:flag.slice(2), transport:read('vps-common/supplier_database.py'),
 definiteplay:read('vps-definiteplay/fulfillment.py'), giftport:read('vps-giftport/fulfillment.py')};
const input = 'import io,sys\nsys.stdin=io.StringIO(' + JSON.stringify(JSON.stringify(payload)) + ')\nexec(' + JSON.stringify(read('vps-common/install_backup.py')) + ')\n';
const result = spawnSync('C:/Windows/System32/OpenSSH/ssh.exe', ['-i','E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519',
 '-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes','root@187.127.167.138','python3 -'],
 {input,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
if(result.status !== 0) { console.error('Backup check or deployment failed. Verify the website endpoint and server service status.'); process.exitCode=1; }
else console.log(result.stdout.trim());
