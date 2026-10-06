/* Installs GiftPort bridge/worker code; preserves existing activation settings. */
const fs = require("node:fs"), path = require("node:path"), {spawnSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const payload = {source: read("vps-giftport/server.py"), worker: read("vps-giftport/fulfillment.py"), unit: read("vps-giftport/ingamepin-giftport.service")};
const installer = read("vps-giftport/install.py");
const input = "import io,sys,json\nsys.stdin=io.StringIO(" + JSON.stringify(JSON.stringify(payload)) + ")\nexec(" + JSON.stringify(installer) + ")\n";
const run = spawnSync("C:/Windows/System32/OpenSSH/ssh.exe", ["-i", "E:/ingamepin/ingamepin/non-website-files/.codex-vps-access/id_ed25519", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=yes", "root@187.127.167.138", "python3 -"], {input, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024});
if (run.status !== 0) { console.error("GiftPort installation did not finish. Check the service; existing supplier credentials were retained."); process.exitCode = 1; }
else console.log(run.stdout.trim());
