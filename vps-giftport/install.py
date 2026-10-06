"""Receives deployment files over SSH stdin. Never prints credentials."""
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

payload = json.load(sys.stdin)
root = pathlib.Path("/opt/ingamepin-giftport")
root.mkdir(exist_ok=True, mode=0o755)
env_path = pathlib.Path("/etc/ingamepin-giftport.env")


def atomic(path, data, mode=0o644):
    path = pathlib.Path(path)
    temp = path.with_name(path.name + ".new")
    fd = os.open(temp, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, "w") as handle:
        handle.write(data)
    temp.replace(path)


def read_secret(path, key):
    for line in path.read_text().splitlines():
        if line.startswith(key + "="):
            value = line.split("=", 1)[1].strip()
            return json.loads(value) if value.startswith('"') else value
    raise RuntimeError("Missing private gateway configuration")


secret = read_secret(env_path, "GIFTPORT_RELAY_SECRET") if env_path.exists() else read_secret(pathlib.Path("/etc/ingamepin-definiteplay.env"), "DEFINITEPLAY_RELAY_SECRET")
compile(payload["source"], "server.py", "exec")
compile(payload["worker"], "fulfillment.py", "exec")
previous_worker = (root / "fulfillment.py").read_text() if (root / "fulfillment.py").exists() else None
previous = (root / "server.py").read_text() if (root / "server.py").exists() else None
if previous:
    atomic(root / ("server.py.backup-" + str(int(time.time()))), previous)
atomic(root / "fulfillment.py", payload["worker"])
atomic(root / "server.py", payload["source"])
atomic("/etc/systemd/system/ingamepin-giftport.service", payload["unit"])
if not env_path.exists():
    atomic(env_path, "GIFTPORT_RELAY_SECRET=" + json.dumps(secret) + "\n", 0o600)
subprocess.run(["systemctl", "daemon-reload"], check=True, capture_output=True)
subprocess.run(["systemctl", "enable", "ingamepin-giftport"], check=True, capture_output=True)
subprocess.run(["systemctl", "restart", "ingamepin-giftport"], check=True, capture_output=True)
ready = False
for attempt in range(10):
    time.sleep(1)
    try:
        request = urllib.request.Request("http://127.0.0.1:8800/status", headers={"Authorization": "Bearer " + secret})
        with urllib.request.urlopen(request, timeout=2) as response:
            result = json.load(response)
            ready = isinstance(result.get("purchasingEnabled"), bool) and "fulfillmentReady" in result
        if ready:
            break
    except Exception:
        pass
if not ready:
    if previous:
        atomic(root / "server.py", previous)
        if previous_worker:
            atomic(root / "fulfillment.py", previous_worker)
        subprocess.run(["systemctl", "restart", "ingamepin-giftport"], capture_output=True)
    raise SystemExit("GiftPort service failed its readiness check")

config = pathlib.Path("/etc/caddy/Caddyfile")
original = config.read_text()
marker = "pally-relay.ingamepin.com {"
route = "\n\thandle_path /giftport/* {\n\t\trequest_body {\n\t\t\tmax_size 16KB\n\t\t}\n\t\treverse_proxy 127.0.0.1:8800\n\t}\n"
if "handle_path /giftport/*" not in original:
    if original.count(marker) != 1:
        raise SystemExit("Could not identify the relay host; existing routing retained")
    candidate = config.with_name("Caddyfile.giftport-candidate")
    candidate.write_text(original.replace(marker, marker + route, 1))
    checked = subprocess.run(["caddy", "validate", "--config", str(candidate), "--adapter", "caddyfile"], capture_output=True)
    if checked.returncode:
        raise SystemExit("Caddy validation failed; existing routing retained")
    atomic(config.with_name("Caddyfile.before-giftport-" + str(int(time.time()))), original, 0o600)
    candidate.replace(config)
    result = subprocess.run(["systemctl", "reload", "caddy"], capture_output=True)
    if result.returncode:
        config.write_text(original)
        subprocess.run(["systemctl", "reload", "caddy"], capture_output=True)
        raise SystemExit("Caddy reload failed; previous routing restored")
print("GiftPort service healthy. Existing activation settings retained; no products were enabled.")
