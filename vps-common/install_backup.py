"""Run through the deployment wrapper. Checks are read-only; activation is explicit."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
import urllib.request

payload = json.load(sys.stdin)
mode = payload["mode"]
if mode not in ("check", "enable", "disable"):
    raise SystemExit("Unknown backup deployment mode")
compile(payload["transport"], "supplier_database.py", "exec")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
class Bridge:
    pass
Bridge.NoRedirect = NoRedirect

def environment(path):
    result = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values = shlex.split(value)
        result[key.strip()] = values[0] if values else ""
    return result

def atomic(path, content, mode):
    temp = path.with_name(path.name + ".backup-new")
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, "w") as stream:
        stream.write(content)
    temp.replace(path)

services = []
for provider, folder in (("DEFINITEPLAY", "definiteplay"), ("GIFTPORT", "giftport")):
    root = Path("/opt/ingamepin-" + folder)
    env_path = Path("/etc/ingamepin-" + folder + ".env")
    config = environment(env_path)
    compile(payload[folder], "fulfillment.py", "exec")
    if mode != "disable":
        namespace = {}
        exec(payload["transport"], namespace)
        previous_env = dict(os.environ)
        try:
            os.environ.update(config)
            os.environ["SUPPLIER_DATABASE_BACKUP_ENABLED"] = "true"
            db = namespace["DatabaseTransport"](Bridge, provider)
            # Force the signed website probe even if the primary route recovers.
            with db.opener.open(db.backup_request(method="GET"), timeout=20) as response:
                if json.loads(response.read(1024)) != {"ready": True}:
                    raise RuntimeError("Backup health failed")
        finally:
            os.environ.clear()
            os.environ.update(previous_env)
    services.append((folder, root, env_path))
if mode == "check":
    print("Both supplier backup paths passed the authenticated read-only database check. No changes made.")
    raise SystemExit(0)

saved = []
backup_dir = Path("/root/ingamepin-backup-deploy-" + str(time.time_ns()))
backup_dir.mkdir(mode=0o700)
try:
    for folder, root, env_path in services:
        changes = {env_path: (env_path.read_text(), 0o600)}
        lines = [line for line in changes[env_path][0].splitlines() if not line.startswith("SUPPLIER_DATABASE_BACKUP_ENABLED=")]
        changes[env_path] = ("\n".join(lines) + "\nSUPPLIER_DATABASE_BACKUP_ENABLED=" + ("true" if mode == "enable" else "false") + "\n", 0o600)
        if mode == "enable":
            changes[root / "supplier_database.py"] = (payload["transport"], 0o644)
            changes[root / "fulfillment.py"] = (payload[folder], 0o644)
        for path, (content, file_mode) in changes.items():
            previous = path.read_text() if path.exists() else None
            saved.append((path, previous, file_mode))
            if previous is not None:
                atomic(backup_dir / (folder + "-" + path.name), previous, 0o600)
            atomic(path, content, file_mode)
    for folder, root, env_path in services:
        subprocess.run(["systemctl", "restart", "ingamepin-" + folder], check=True, capture_output=True)
    time.sleep(3)
    for folder, root, env_path in services:
        subprocess.run(["systemctl", "is-active", "--quiet", "ingamepin-" + folder], check=True, capture_output=True)
except Exception:
    for path, previous, file_mode in reversed(saved):
        if previous is None:
            path.unlink(missing_ok=True)
        else:
            atomic(path, previous, file_mode)
    for folder, root, env_path in services:
        subprocess.run(["systemctl", "restart", "ingamepin-" + folder], capture_output=True)
    raise SystemExit("Deployment failed. Previous files and configuration restored.") from None
print("Supplier database backup " + ("enabled" if mode == "enable" else "disabled") + ". Previous files saved in " + str(backup_dir))
