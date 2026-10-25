"""Private, non-retrying Wupex transport. No supplier credentials are persisted or logged."""
import hashlib
import hmac
import http.server
import http.client
import socket
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from contextlib import closing

PORT = 8803
OUTBOUND_IPV4 = "187.127.167.138"
MAX_REQUEST = 256 * 1024
MAX_RESPONSE = 4 * 1024 * 1024
BASES = {"https://service.wupex.com", "https://sandbox-service.wupex.com"}
ENDPOINTS = {
    "/api/customer/balance": ("GET", set(), set()),
    "/api/preorder/status": ("GET", set(), set()),
    "/api/product/merchant/invited/list": ("POST", set(), set()),
    "/api/order/topup-listservers": ("POST", {"sku"}, {"sku"}),
    "/api/order/topup/product/attribute": ("GET", {"productId"}, {"productId"}),
    "/api/order/topup": ("POST", set(), set()),
    "/api/order/pull-codes": ("POST", {"referenceId", "allowTakeAll"}, {"referenceId", "allowTakeAll"}),
    "/api/order/detail": ("GET", {"orderName", "referenceId"}, set()),
}
SLOTS = threading.BoundedSemaphore(8)


def validate_request(value):
    if not isinstance(value, dict) or set(value) - {"baseUrl", "endpoint", "method", "apiKey", "body"}:
        raise ValueError("Invalid request")
    base = value.get("baseUrl")
    if base not in BASES:
        raise ValueError("Invalid service")
    endpoint = value.get("endpoint")
    if not isinstance(endpoint, str) or len(endpoint) > 2048 or re.search(r"[\x00-\x20\x7f\\#]", endpoint):
        raise ValueError("Invalid endpoint")
    parts = urllib.parse.urlsplit(endpoint)
    if parts.scheme or parts.netloc or parts.fragment or parts.path not in ENDPOINTS:
        raise ValueError("Invalid endpoint")
    method, allowed, required = ENDPOINTS[parts.path]
    if value.get("method") != method:
        raise ValueError("Invalid method")
    pairs = urllib.parse.parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True)
    query = dict(pairs)
    if len(query) != len(pairs) or set(query) - allowed or not required.issubset(query) or any(not v for v in query.values()):
        raise ValueError("Invalid query")
    if parts.path == "/api/order/detail" and len(query) != 1:
        raise ValueError("One lookup identifier required")
    if parts.path == "/api/order/pull-codes":
        if query["allowTakeAll"] != "false" or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", query["referenceId"]):
            raise ValueError("Invalid purchase reference")
    key = value.get("apiKey")
    if not isinstance(key, str) or not re.fullmatch(r"[\x21-\x7e]{8,2048}", key):
        raise ValueError("Invalid credentials")
    body = value.get("body")
    if method == "GET" and body is not None:
        raise ValueError("Unexpected body")
    if method == "POST" and parts.path != "/api/order/topup-listservers" and not isinstance(body, (dict, list)):
        raise ValueError("Missing body")
    if parts.path == "/api/order/topup-listservers" and body is not None:
        raise ValueError("Unexpected body")
    # The website sends only single-unit purchases, after acquiring its durable database lease.
    if parts.path == "/api/order/pull-codes":
        if not isinstance(body, list) or len(body) != 1 or not isinstance(body[0], dict) or type(body[0].get("quantity")) is not int or body[0].get("quantity") != 1:
            raise ValueError("Invalid purchase quantity")
    if parts.path == "/api/order/topup" and (not isinstance(body, dict) or type(body.get("quantity")) is not int or body.get("quantity") != 1):
        raise ValueError("Invalid purchase quantity")
    return base + endpoint, method, key, None if body is None else json.dumps(body, separators=(",", ":")).encode()


class ReplayGuard:
    def __init__(self, path):
        self.path = str(path)
        self.lock = threading.Lock()
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS requests(nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)")

    def accept(self, nonce, now):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            db.execute("DELETE FROM requests WHERE expires < ?", (now,))
            try:
                db.execute("INSERT INTO requests VALUES(?,?)", (nonce, now + 180))
                return True
            except sqlite3.IntegrityError:
                return False


def authenticate(headers, body, secret, guard, now=None):
    now = int(time.time()) if now is None else now
    stamp, nonce, supplied = (headers.get(k, "") for k in ("x-wupex-timestamp", "x-wupex-nonce", "x-wupex-signature"))
    if not re.fullmatch(r"\d{10,12}", stamp) or abs(now - int(stamp)) > 60:
        return False
    if not re.fullmatch(r"[a-f0-9]{48}", nonce) or not re.fullmatch(r"[a-f0-9]{64}", supplied):
        return False
    expected = hmac.new(secret, (stamp + "\n" + nonce + "\n").encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, supplied) and guard.accept(nonce, now)


def connect_ipv4(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    # Scope IPv4 to this relay; do not change system-wide networking or other suppliers.
    host, port = address
    last_error = None
    for family, socktype, protocol, _, destination in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
        connection = socket.socket(family, socktype, protocol)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                connection.settimeout(timeout)
            connection.bind((OUTBOUND_IPV4, 0))
            connection.connect(destination)
            return connection
        except OSError as error:
            last_error = error
            connection.close()
    if last_error is not None:
        raise last_error
    raise OSError("Wupex has no IPv4 service address")


class IPv4HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = connect_ipv4


class IPv4HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        # HTTPSConnection still verifies the certificate and sends the original hostname as SNI.
        return self.do_open(IPv4HTTPSConnection, request, context=self._context)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def forward(value, opener=None):
    url, method, key, body = validate_request(value)
    request = urllib.request.Request(url, data=body, method=method, headers={
        "x-api-key": key, "Accept-Language": "en", "Accept": "application/json",
        "User-Agent": "InGamePin-Wupex-Relay/1.0",
        **({"Content-Type": "application/json"} if body is not None else {}),
    })
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), IPv4HTTPSHandler(), NoRedirect())
    try:
        response = opener.open(request, timeout=12)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read(MAX_RESPONSE + 1)
        if len(data) > MAX_RESPONSE:
            return 502, {"relayError": "UPSTREAM_RESPONSE_TOO_LARGE"}
        status = response.code
        if 300 <= status < 400:
            return 502, {"relayError": "UPSTREAM_REDIRECT_REFUSED"}
        content_type = response.headers.get("Content-Type", "").lower()
        if "json" not in content_type:
            cloudflare = response.headers.get("cf-mitigated") == "challenge" or (
                response.headers.get("server", "").lower() == "cloudflare"
                and (b"Attention Required!" in data or b"Sorry, you have been blocked" in data or b"cf-chl-" in data)
            )
            if cloudflare:
                ray = response.headers.get("cf-ray", "")
                return 403, {"relayError": "UPSTREAM_CLOUDFLARE_BLOCK",
                             "rayId": ray if re.fullmatch(r"[a-fA-F0-9]{8,32}(?:-[A-Z0-9]{2,8})?", ray) else ""}
            if not 200 <= status < 300:
                return status, {"relayError": "UPSTREAM_DENIED" if status in (401, 403) else "UPSTREAM_HTTP_ERROR"}
            return 502, {"relayError": "UPSTREAM_INVALID_RESPONSE"}
        if not 200 <= status < 300:
            return status, {"relayError": "UPSTREAM_DENIED" if status in (401, 403) else "UPSTREAM_HTTP_ERROR"}
        try:
            parsed = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            return 502, {"relayError": "UPSTREAM_INVALID_RESPONSE"}
        if not isinstance(parsed, dict):
            return 502, {"relayError": "UPSTREAM_INVALID_RESPONSE"}
        if parsed.get("status") is not True:
            return 502, {"relayError": "UPSTREAM_REJECTED"}
        return status, parsed


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "InGamePin-Wupex"
    sys_version = ""
    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, value):
        data = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def do_GET(self):
        self.reply(405, {"relayError": "METHOD_NOT_ALLOWED"})

    def do_POST(self):
        if self.path != "/request":
            return self.reply(404, {"relayError": "NOT_FOUND"})
        length = self.headers.get("Content-Length", "")
        if self.headers.get("Transfer-Encoding") or not re.fullmatch(r"\d{1,8}", length) or not 0 < int(length) <= MAX_REQUEST:
            return self.reply(413, {"relayError": "INVALID_BODY_SIZE"})
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            return self.reply(415, {"relayError": "INVALID_CONTENT_TYPE"})
        if not SLOTS.acquire(blocking=False):
            return self.reply(503, {"relayError": "RELAY_BUSY"})
        try:
            body = self.rfile.read(int(length))
            if len(body) != int(length):
                return self.reply(400, {"relayError": "INVALID_REQUEST"})
            if not authenticate(self.headers, body, self.server.signing_key, self.server.replay_guard):
                return self.reply(401, {"relayError": "RELAY_AUTH_FAILED"})
            try:
                value = json.loads(body)
                validate_request(value)
            except (ValueError, UnicodeDecodeError, TypeError):
                return self.reply(400, {"relayError": "INVALID_REQUEST"})
            try:
                status, data = forward(value)
            except Exception:
                # Never retry a request, including when the supplier may have accepted a purchase.
                return self.reply(502, {"relayError": "UPSTREAM_UNREACHABLE"})
            self.reply(status, data)
        finally:
            SLOTS.release()


def main():
    secret = os.environ.get("WUPEX_RELAY_SIGNING_KEY", "")
    if not re.fullmatch(r"[a-f0-9]{64}", secret):
        raise RuntimeError("Relay signing key is not configured")
    state = Path(os.environ.get("STATE_DIRECTORY", "/var/lib/ingamepin-wupex"))
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.signing_key = bytes.fromhex(secret)
    server.replay_guard = ReplayGuard(state / "requests.sqlite3")
    server.serve_forever()


if __name__ == "__main__":
    main()
