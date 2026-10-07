/* Upgrades only the existing supplier worker. Does not enable products or create orders. */
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),mode=process.argv[2]||"check";
if(!["check","enable"].includes(mode))throw Error("Use check or enable");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const payload={mode,files:Object.fromEntries(["server.py","fulfillment.py","open_value.py"].map(name=>[name,read("vps-definiteplay/"+name)])),expected:{"server.py":"9d43431b6ab4f6d45b02eb127eb77525a269e79d34f5c89d07a0bff04ea3ea7e","fulfillment.py":"3e5b56fdacab8d094cbe3d6c7487796e7ca690e1dabd1777f178c066999d02c2","open_value.py":null}};
const installer=read("vps-definiteplay/upgrade_ranges.py");
const input="import base64,io,sys\nsys.stdin=io.StringIO(base64.b64decode('"+Buffer.from(JSON.stringify(payload)).toString("base64")+"').decode())\nexec(compile(base64.b64decode('"+Buffer.from(installer).toString("base64")+"').decode(),'range_upgrade','exec'))";
const result=spawnSync("C:/Windows/System32/OpenSSH/ssh.exe",["-i","E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519","-o","BatchMode=yes","-o","ConnectTimeout=15","-o","StrictHostKeyChecking=yes","root@187.127.167.138","python3 -"],{input,encoding:"utf8",timeout:200000,maxBuffer:1048576});
for(const line of result.stdout.split(/\r?\n/).filter(Boolean)){try{console.log(JSON.stringify(JSON.parse(line)));}catch{}}
if(result.status!==0){console.error("Supplier upgrade did not complete. Check readiness and the protected backup before retrying.");process.exitCode=1;}
