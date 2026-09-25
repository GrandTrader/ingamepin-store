/* Initial connection. This file contains no credentials; all values are read at runtime. */
const fs=require("node:fs"), {parseEnv}=require("node:util"), {spawnSync}=require("node:child_process");
const {createClient}=require("@supabase/supabase-js");
(async()=>{
 const env=parseEnv(fs.readFileSync(".env.local","utf8"));
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const results=await Promise.all([
  db.from("definiteplay_stock").select("option_id",{count:"exact",head:true}),
  db.from("definiteplay_jobs").select("item_id",{count:"exact",head:true}),
  db.from("products").select("id",{count:"exact",head:true}).eq("stock_source","DEFINITEPLAY")
 ]);
 if(results.some(r=>r.error)||results[1].count!==0||results[2].count!==0)throw Error("Initial setup requires the migration and no existing supplier jobs or enabled products.");
 const config={NEXT_PUBLIC_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SECRET_KEY:env.SUPABASE_SECRET_KEY,DEFINITEPLAY_FULFILLMENT_ENABLED:"true"};
 if(Object.values(config).some(v=>!v||/[\r\n]/.test(v)))throw Error("Invalid private configuration");
 const remote = [
 "import base64,json,pathlib,os,subprocess,time,urllib.request",
 "values=json.loads(base64.b64decode('"+Buffer.from(JSON.stringify(config)).toString("base64")+"'))",
 "file=pathlib.Path('/etc/ingamepin-definiteplay.env')",
 "original=file.read_text()",
 "if 'DEFINITEPLAY_FULFILLMENT_ENABLED=' in original: raise RuntimeError('Worker already configured')",
 "for name in ('server.py','fulfillment.py'): compile((pathlib.Path('/opt/ingamepin-definiteplay')/name).read_text(),name,'exec')",
 "def write_env(data):",
 "    tmp=file.with_suffix('.env.new')",
 "    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)",
 "    os.fchmod(fd,0o600)",
 "    with os.fdopen(fd,'w') as handle: handle.write(data)",
 "    tmp.replace(file)",
 "def quote(v): return chr(34)+v.replace(chr(92),chr(92)*2).replace(chr(34),chr(92)+chr(34))+chr(34)",
 "updated=original.rstrip()+'\\n'+'\\n'.join(k+'='+quote(v) for k,v in values.items())+'\\n'",
 "secret=None",
 "for line in original.splitlines():",
 "    if line.startswith('DEFINITEPLAY_RELAY_SECRET='): secret=json.loads(line.split('=',1)[1])",
 "if not secret: raise RuntimeError('Missing relay configuration')",
 "write_env(updated)",
 "try:",
 "    subprocess.run(['systemctl','restart','ingamepin-definiteplay.service'],check=True,capture_output=True)",
 "    ready=False",
 "    for attempt in range(12):",
 "        time.sleep(2)",
 "        try:",
 "            req=urllib.request.Request('http://127.0.0.1:8798/status',headers={'Authorization':'Bearer '+secret})",
 "            with urllib.request.urlopen(req,timeout=3) as response: status=json.load(response)",
 "            if status.get('fulfillmentReady'): ready=True;break",
 "        except Exception: pass",
 "    if not ready: raise RuntimeError('Worker not ready')",
 "    print('Supplier worker connected and healthy. Product modes unchanged.')",
 "except Exception:",
 "    write_env(original)",
 "    subprocess.run(['systemctl','restart','ingamepin-definiteplay.service'],capture_output=True)",
 "    raise SystemExit(1)"
 ].join("\n");
 const run=spawnSync("C:/Windows/System32/OpenSSH/ssh.exe",["-i","E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519","-o","BatchMode=yes","-o","ConnectTimeout=15","-o","StrictHostKeyChecking=yes","root@187.127.167.138","python3 -"],{input:remote,encoding:"utf8",timeout:60000,maxBuffer:1048576});
 if(run.status!==0)throw Error("Connection failed; check the service. No product mode was changed.");
 console.log(run.stdout.trim());
})().catch(e=>{console.error(e.message);process.exitCode=1});
