// Installs only the isolated relay on the website's existing VPS. No supplier purchases.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd());
const master=process.env.WUPEX_ENCRYPTION_KEY||process.env.SUPABASE_SECRET_KEY;
if(!master||master.length<32)throw Error('Server signing configuration unavailable');
const identity=process.env.INGAMEPIN_VPS_SSH_KEY||'E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519';
if(!fs.existsSync(identity))throw Error('Existing VPS SSH identity is unavailable');
const payload={
 source:fs.readFileSync('vps-wupex/server.py','utf8'),
 unit:fs.readFileSync('vps-wupex/ingamepin-wupex.service','utf8'),
 signingKey:Buffer.from(crypto.hkdfSync('sha256',master,'ingamepin-wupex-relay-v1','request-authentication',32)).toString('hex'),
};
const installer=Buffer.from(fs.readFileSync('vps-wupex/install.py','utf8')).toString('base64');
const command='python3 -c "import base64;exec(base64.b64decode(\''+installer+'\'))"';
const result=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',[
 '-i',identity,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes',
 'root@187.127.167.138',command,
],{input:JSON.stringify(payload),encoding:'utf8',timeout:120000,maxBuffer:1024*1024,windowsHide:true});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
