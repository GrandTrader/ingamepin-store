"""Scoped, backed-up upgrade of an already configured supplier worker."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import sqlite3
import subprocess
import sys
import time
import urllib.request

payload = json.load(sys.stdin)
root = Path("/opt/ingamepin-definiteplay")
env_path = Path("/etc/ingamepin-definiteplay.env")
original_env = env_path.read_text()
config = {}
for line in original_env.splitlines():
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        values = shlex.split(value)
        config[key.strip()] = values[0] if values else ""

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError("Redirect refused")

opener = urllib.request.build_opener(NoRedirect())
def read_json(url, headers, timeout=8):
    with opener.open(urllib.request.Request(url, headers=headers), timeout=timeout) as response:
        return json.load(response)

relay_headers = {"Authorization": "Bearer " + config["DEFINITEPLAY_RELAY_SECRET"]}
db_headers = {"apikey": config["SUPABASE_SECRET_KEY"], "Authorization": "Bearer " + config["SUPABASE_SECRET_KEY"]}
db_url = config["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
if config.get("DEFINITEPLAY_FULFILLMENT_ENABLED") != "true":
    raise SystemExit("Existing fulfillment service must already be configured")
# GET only: migration availability and absence of active custom-value products.
schema = read_json(db_url, db_headers)
for name in ("sync_definiteplay_ranges", "definiteplay_range_cost", "save_supplier_range_percentage"):
    if "/rpc/" + name not in schema.get("paths", {}):
        raise SystemExit("Required database update is missing")
if read_json(db_url + "product_range_settings?select=option_id&delivery_mode=eq.SUPPLIER&enabled=eq.true&limit=1", db_headers):
    raise SystemExit("This initial range upgrade requires supplier ranges to remain disabled")
status = read_json("http://127.0.0.1:8798/status", relay_headers)
if not status.get("fulfillmentReady"):
    raise SystemExit("Existing delivery service is not healthy; no update made")

for name, source in payload["files"].items():
    if name not in ("server.py", "fulfillment.py", "open_value.py"):
        raise SystemExit("Unexpected deployment file")
    compile(source, name, "exec")
    file = root / name
    current = hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
    desired = hashlib.sha256(source.encode()).hexdigest()
    if current not in (payload["expected"].get(name), desired):
        raise SystemExit("Installed supplier source changed; comparison required")

if payload["mode"] == "check":
    print(json.dumps({"preflight": "passed", "changes": False}), flush=True)
    raise SystemExit(0)
if payload["mode"] != "enable":
    raise SystemExit("Unknown mode")

backup = Path("/root/ingamepin-range-upgrade-" + str(time.time_ns()))
backup.mkdir(mode=0o700)
saved = {}
changes = {root / name: source.encode() for name, source in payload["files"].items()}
lines = [line for line in original_env.splitlines() if not line.startswith("DEFINITEPLAY_RANGE_ENABLED=")]
changes[env_path] = ("\n".join(lines) + "\nDEFINITEPLAY_RANGE_ENABLED=true\n").encode()

def atomic(file, data, mode):
    temporary = file.with_name(file.name + ".range-new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
    temporary.replace(file)

for file in changes:
    previous = file.read_bytes() if file.exists() else None
    mode = file.stat().st_mode & 0o777 if file.exists() else 0o644
    saved[file] = (previous, mode)
    if previous is not None:
        atomic(backup / file.name, previous, 0o600)
# SQLite backup retains supplier mappings while the running service is still healthy.
state = Path(config.get("DEFINITEPLAY_STATE_DIR", "/var/lib/ingamepin-definiteplay")) / "catalogue.db"
if state.exists():
    with sqlite3.connect(str(state), timeout=10) as source, sqlite3.connect(str(backup / "catalogue.db")) as target:
        source.backup(target)
    os.chmod(backup / "catalogue.db", 0o600)
print(json.dumps({"backup": str(backup), "installing": True}), flush=True)
try:
    subprocess.run(["systemctl", "stop", "ingamepin-definiteplay"], check=True, capture_output=True, timeout=25)
    for file, data in changes.items():
        atomic(file, data, 0o600 if file == env_path else 0o644)
    subprocess.run(["systemctl", "start", "ingamepin-definiteplay"], check=True, capture_output=True, timeout=20)
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        time.sleep(2)
        try:
            status = read_json("http://127.0.0.1:8798/status", relay_headers, 3)
            ranges = read_json("http://127.0.0.1:8798/open-catalogue", relay_headers, 3)
            if status.get("fulfillmentReady") and ranges.get("rangeReady") and not ranges.get("stale") and ranges.get("products"):
                rows = read_json(db_url + "definiteplay_ranges?select=sku&available=eq.true&limit=100", db_headers)
                if rows:
                    print(json.dumps({"installed": True, "fixedDeliveryReady": True, "rangeDeliveryReady": True, "catalogueProducts": len(ranges["products"]), "databaseProducts": len(rows), "productSettingsChanged": False}), flush=True)
                    break
        except Exception:
            pass
    else:
        raise RuntimeError("Readiness check did not pass")
except BaseException:
    subprocess.run(["systemctl", "stop", "ingamepin-definiteplay"], capture_output=True, timeout=25)
    for file, (previous, mode) in saved.items():
        if previous is None:
            file.unlink(missing_ok=True)
        else:
            atomic(file, previous, mode)
    subprocess.run(["systemctl", "start", "ingamepin-definiteplay"], capture_output=True, timeout=20)
    raise SystemExit("Update failed; previous supplier files and configuration restored") from None
