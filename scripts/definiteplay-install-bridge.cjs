/* Installs only the read-only supplier bridge; does not deploy the website. */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {parseEnv}=require("node:util");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
process.chdir(root);
const credentials=parseEnv(fs.readFileSync(".env.definiteplay.local","utf8"));
const keys=["DEFINITEPLAY_SECURITY_ID","DEFINITEPLAY_API_PASSWORD","DEFINITEPLAY_API_KEY","DEFINITEPLAY_CUSTOMER_ID"];
for(const key of keys)if(!credentials[key])throw Error("Missing required supplier configuration");
const localPath=path.join(root,".env.local");
let local=fs.readFileSync(localPath,"utf8");
const env=parseEnv(local);
const secret=env.DEFINITEPLAY_RELAY_SECRET||crypto.randomBytes(32).toString("hex");
const url="https://pally-relay.ingamepin.com/definiteplay";
function setEnv(key,value){
  const line=key+"="+JSON.stringify(value);
  const re=new RegExp("^"+key+"=.*$","m");
  local=re.test(local)?local.replace(re,()=>line):local.trimEnd()+"\n"+line+"\n";
}
setEnv("DEFINITEPLAY_RELAY_SECRET",secret);
setEnv("DEFINITEPLAY_RELAY_URL",url);
fs.writeFileSync(localPath,local);
const quote=value=>'"'+value.replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\n/g,"\\n").replace(/\r/g,"\\r")+'"';
const serviceEnv=[...keys.map(k=>k+"="+quote(credentials[k])),"DEFINITEPLAY_RELAY_SECRET="+quote(secret)].join("\n")+"\n";
const payload={
  source:fs.readFileSync("vps-definiteplay/server.py","utf8"),
  worker:fs.readFileSync("vps-definiteplay/fulfillment.py","utf8"),
  unit:fs.readFileSync("vps-definiteplay/ingamepin-definiteplay.service","utf8"),
  env:serviceEnv,
};
const remote="\nimport base64,json,pathlib,os,subprocess,time\np=json.loads(base64.b64decode(\"PAYLOAD\"))\nroot=pathlib.Path(\"/opt/ingamepin-definiteplay\")\nroot.mkdir(mode=0o755,exist_ok=True)\nexisting_env=pathlib.Path(\"/etc/ingamepin-definiteplay.env\")\nif existing_env.exists() and \"DEFINITEPLAY_FULFILLMENT_ENABLED\" in existing_env.read_text():\n    raise RuntimeError(\"Use the fulfillment-aware deployment procedure for an activated bridge\")\ndef atomic(file,data,mode):\n    file=pathlib.Path(file)\n    temp=file.with_name(file.name+\".new\")\n    fd=os.open(str(temp),os.O_WRONLY|os.O_CREAT|os.O_TRUNC,mode)\n    os.fchmod(fd,mode)\n    with os.fdopen(fd,\"w\") as handle: handle.write(data)\n    temp.replace(file)\natomic(root/\"server.py\",p[\"source\"],0o644)\natomic(root/\"fulfillment.py\",p[\"worker\"],0o644)\natomic(\"/etc/ingamepin-definiteplay.env\",p[\"env\"],0o600)\natomic(\"/etc/systemd/system/ingamepin-definiteplay.service\",p[\"unit\"],0o644)\nsubprocess.run([\"systemctl\",\"daemon-reload\"],check=True)\nsubprocess.run([\"systemctl\",\"enable\",\"ingamepin-definiteplay.service\"],check=True,capture_output=True)\nsubprocess.run([\"systemctl\",\"restart\",\"ingamepin-definiteplay.service\"],check=True)\nconfig=pathlib.Path(\"/etc/caddy/Caddyfile\")\noriginal=config.read_text()\nmarker=\"pally-relay.ingamepin.com {\"\nroute=\"\\n\\thandle_path /definiteplay/* {\\n\\t\\treverse_proxy 127.0.0.1:8798\\n\\t}\\n\"\nif \"handle_path /definiteplay/*\" not in original:\n    if original.count(marker)!=1: raise RuntimeError(\"Unable to identify relay host\")\n    updated=original.replace(marker,marker+route,1)\n    candidate=config.with_name(\"Caddyfile.definiteplay-candidate\")\n    candidate.write_text(updated)\n    checked=subprocess.run([\"caddy\",\"validate\",\"--config\",str(candidate),\"--adapter\",\"caddyfile\"],capture_output=True)\n    if checked.returncode: raise RuntimeError(\"Caddy candidate validation failed; existing routing retained\")\n    backup=config.with_name(\"Caddyfile.before-definiteplay-\"+str(int(time.time())))\n    backup.write_text(original)\n    candidate.replace(config)\n    result=subprocess.run([\"systemctl\",\"reload\",\"caddy\"],capture_output=True)\n    if result.returncode:\n        config.write_text(original)\n        subprocess.run([\"systemctl\",\"reload\",\"caddy\"],capture_output=True)\n        raise RuntimeError(\"Caddy reload failed; previous configuration restored\")\nprint(\"Supplier bridge service: \"+subprocess.check_output([\"systemctl\",\"is-active\",\"ingamepin-definiteplay.service\"],text=True).strip())\nprint(\"HTTPS supplier route configured\")\n";
const script=remote.replace("PAYLOAD",Buffer.from(JSON.stringify(payload)).toString("base64"));
const run=spawnSync("C:/Windows/System32/OpenSSH/ssh.exe",[
  "-i","E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519",
  "-o","BatchMode=yes","-o","ConnectTimeout=15","-o","StrictHostKeyChecking=yes",
  "root@187.127.167.138","python3 -"
],{input:script,encoding:"utf8",timeout:60000,maxBuffer:1024*1024});
if(run.status!==0) {
  console.error("Supplier bridge installation did not finish. Check the remote service configuration.");
  process.exitCode=1;
} else console.log(run.stdout.trim());
