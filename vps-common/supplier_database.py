"""Alternate database path; never replay a possibly committed RPC."""
import hashlib
import hmac
import json
import os
import time
import urllib.request

BACKUP_URL = "https://www.ingamepin.com/api/internal/supplier-database"
MAX_RESPONSE = 8 * 1024 * 1024


class DatabaseTransport:
    def __init__(self, bridge, provider):
        self.provider = provider
        self.url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SECRET_KEY"]
        if not self.url.startswith("https://"):
            raise ValueError("Database HTTPS required")
        self.backup = os.environ.get("SUPPLIER_DATABASE_BACKUP_ENABLED") == "true"
        self.secret = os.environ.get(provider + "_RELAY_SECRET", "")
        if self.backup and len(self.secret) < 32:
            raise ValueError("Backup authentication is missing")
        self.opener = urllib.request.build_opener(bridge.NoRedirect())
        self.route = None
        self.check_at = 0

    def direct_request(self, path, data=None, method="POST"):
        return urllib.request.Request(self.url + "/rest/v1/" + path, data=data, method=method,
            headers={"apikey": self.key, "Authorization": "Bearer " + self.key,
                     "Content-Type": "application/json"})

    def backup_request(self, data=None, method="POST"):
        stamp = str(int(time.time()))
        digest = hashlib.sha256(data or b"").hexdigest()
        message = "\n".join(("supplier-database-v1", self.provider, method, stamp, digest))
        signature = hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        # Only a signature is sent to the website, never the database or relay key.
        return urllib.request.Request(BACKUP_URL, data=data, method=method, headers={
            "Content-Type": "application/json", "X-Supplier-Provider": self.provider,
            "X-Supplier-Time": stamp, "X-Supplier-Signature": signature})

    def select_route(self):
        if not self.backup:
            return "direct"
        if self.route and time.monotonic() < self.check_at:
            return self.route
        # Only read-only probes may be retried across routes. No jobs are claimed here.
        try:
            with self.opener.open(self.direct_request("definiteplay_jobs?select=item_id&limit=0", method="HEAD"), timeout=5):
                pass
            route = "direct"
        except Exception:
            with self.opener.open(self.backup_request(method="GET"), timeout=12) as response:
                if json.loads(response.read(1024)) != {"ready": True}:
                    raise RuntimeError("Backup database unavailable")
            route = "backup"
        self.route, self.check_at = route, time.monotonic() + 60
        return route

    def rpc(self, name, payload):
        try:
            route = self.select_route()
            if route == "backup":
                data = json.dumps({"name": name, "args": payload}).encode()
                request = self.backup_request(data)
            else:
                request = self.direct_request("rpc/" + name, json.dumps(payload).encode())
            with self.opener.open(request, timeout=25) as response:
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError()
                return json.loads(raw, parse_float=str) if raw else None
        except Exception:
            # The server may have committed before a timeout. Propagate the failure;
            # existing leases/submission markers decide what the next worker does.
            self.route, self.check_at = None, 0
            raise RuntimeError("Supplier database operation failed") from None
