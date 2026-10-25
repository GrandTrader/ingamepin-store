"""Install the isolated Wupex service, with backups and rollback. Invoked over SSH."""
import hashlib
import hmac
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path("/opt/ingamepin-wupex")
UNIT = Path("/etc/systemd/system/ingamepin-wupex.service")
ENV = Path("/etc/ingamepin-wupex.env")
CADDY = Path("/etc/caddy/Caddyfile")


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError("Command failed: " + " ".join(args[:2]))
    return result.stdout.strip()


def active(name):
    return subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True).stdout.strip() == "active"


def atomic(path, value, mode):
    temporary = path.with_name(path.name + ".wupex-new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, "wb") as handle:
        handle.write(value)
    temporary.replace(path)


def install(payload):
    if os.geteuid() != 0:
        raise RuntimeError("Administrator SSH access required")
    source, unit, key = payload["source"], payload["unit"], payload["signingKey"]
    compile(source, "server.py", "exec")
    if not re.fullmatch(r"[a-f0-9]{64}", key):
        raise RuntimeError("Invalid signing configuration")
    if not active("caddy") or not active("ingamepin-definiteplay"):
        raise RuntimeError("An existing service needs attention; installation stopped")
    was_active = active("ingamepin-wupex")
    if not was_active:
        check = socket.socket()
        try:
            check.bind(("127.0.0.1", 8803))
        finally:
            check.close()
    original = CADDY.read_bytes()
    text = original.decode()
    marker = "pally-relay.ingamepin.com {"
    route = "\n\thandle_path /wupex/* {\n\t\treverse_proxy 127.0.0.1:8803\n\t}\n"
    if text.count(marker) != 1:
        raise RuntimeError("Cannot identify the existing relay HTTPS host")
    if "handle_path /wupex/*" in text:
        if route.strip() not in text:
            raise RuntimeError("An unexpected Wupex route already exists")
        desired = original
    else:
        desired = text.replace(marker, marker + route, 1).encode()
    backup = Path("/root/ingamepin-wupex-backup-" + str(time.time_ns()))
    backup.mkdir(mode=0o700)
    paths = [ROOT / "server.py", UNIT, ENV, CADDY]
    previous = {}
    for index, path in enumerate(paths):
        if path.exists():
            previous[path] = (path.read_bytes(), path.stat().st_mode & 0o777)
            saved = backup / (str(index) + "-" + path.name)
            saved.write_bytes(previous[path][0])
            saved.chmod(0o600)
        else:
            previous[path] = None
    print(json.dumps({"backup": str(backup), "installing": True}), flush=True)
    caddy_changed = False
    try:
        ROOT.mkdir(mode=0o755, parents=True, exist_ok=True)
        atomic(ROOT / "server.py", source.encode(), 0o644)
        atomic(UNIT, unit.encode(), 0o644)
        atomic(ENV, ("WUPEX_RELAY_SIGNING_KEY=" + key + "\n").encode(), 0o600)
        candidate = backup / "Caddyfile.candidate"
        candidate.write_bytes(desired)
        run(["caddy", "validate", "--config", str(candidate), "--adapter", "caddyfile"])
        run(["systemctl", "daemon-reload"])
        run(["systemctl", "enable", "ingamepin-wupex"])
        run(["systemctl", "restart", "ingamepin-wupex"])
        # Check request authentication locally without sending anything to Wupex.
        body = b"{}"
        ready = False
        for _ in range(15):
            stamp, nonce = str(int(time.time())), os.urandom(24).hex()
            signature = hmac.new(bytes.fromhex(key), (stamp + "\n" + nonce + "\n").encode() + body, hashlib.sha256).hexdigest()
            request = urllib.request.Request("http://127.0.0.1:8803/request", data=body, headers={
                "Content-Type": "application/json", "x-wupex-timestamp": stamp,
                "x-wupex-nonce": nonce, "x-wupex-signature": signature})
            try:
                urllib.request.urlopen(request, timeout=2)
            except urllib.error.HTTPError as error:
                ready = error.code == 400 and json.load(error).get("relayError") == "INVALID_REQUEST"
            except Exception:
                pass
            if ready:
                break
            time.sleep(1)
        if not ready:
            raise RuntimeError("Wupex service authentication check failed")
        if desired != original:
            if CADDY.read_bytes() != original:
                raise RuntimeError("Existing HTTPS routing changed during installation")
            atomic(CADDY, desired, previous[CADDY][1])
            caddy_changed = True
            run(["systemctl", "reload", "caddy"])
        if not all(active(n) for n in ["ingamepin-wupex", "caddy", "ingamepin-definiteplay"]):
            raise RuntimeError("Service health check failed")
        print(json.dumps({"installed": True, "authenticatedHealthCheck": True,
                          "wupexService": "active", "existingSupplierService": "active",
                          "httpsProxy": "active", "sourceSha256": hashlib.sha256(source.encode()).hexdigest()}))
    except Exception:
        # Restore only files this installer owns. Other supplier services are never restarted.
        for path in paths:
            if path == CADDY and not caddy_changed:
                continue
            old = previous[path]
            if old is None:
                if path.exists():
                    path.unlink()
            else:
                atomic(path, old[0], old[1])
        subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
        subprocess.run(["systemctl", "restart" if was_active else "stop", "ingamepin-wupex"], capture_output=True)
        if not was_active:
            subprocess.run(["systemctl", "disable", "ingamepin-wupex"], capture_output=True)
        if caddy_changed:
            subprocess.run(["systemctl", "reload", "caddy"], capture_output=True)
        print(json.dumps({"rolledBack": True, "backup": str(backup)}), flush=True)
        raise


if __name__ == "__main__":
    install(json.load(sys.stdin))
