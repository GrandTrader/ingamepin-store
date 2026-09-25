"""Private catalogue and product-link service. It has no purchasing endpoint."""
import hashlib
import hmac
import json
import os
import sys
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATE = Path(os.environ.get("DEFINITEPLAY_STATE_DIR", "/var/lib/ingamepin-definiteplay"))
SYNC_LOCK = threading.Lock()
DB_LOCK = threading.Lock()
SESSION_TOKEN = ""
SESSION_UNTIL = 0
LAST_REQUEST = 0
LAST_DT = ""
FULFILLMENT_ERROR = None
FULFILLMENT_HEARTBEAT = 0
UUID = re.compile(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")
SKU = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


@contextmanager
def database():
    connection = sqlite3.connect(STATE / "catalogue.db", timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize():
    STATE.mkdir(parents=True, exist_ok=True)
    with database() as db:
        db.execute("CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, synced REAL NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS mappings (option_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, sku TEXT NOT NULL, updated REAL NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS sync_status (id INTEGER PRIMARY KEY CHECK(id=1), error TEXT, attempted REAL NOT NULL)")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Supplier redirected the request")


def supplier_request(endpoint, method, body=None, authenticated=True, query=None, timeout=30):
    global LAST_REQUEST, LAST_DT
    permitted = ["session.php", "balances.php", "fetchstocklist_v2.php"]
    if os.environ.get("DEFINITEPLAY_FULFILLMENT_ENABLED") == "true":
        permitted += ["order_v2.php", "fetchorder_v2.php"]
    if endpoint not in permitted:
        raise ValueError("Endpoint not permitted")
    time.sleep(max(0, 1.2 - (time.monotonic() - LAST_REQUEST)))
    dt = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    while dt == LAST_DT:
        time.sleep(0.2)
        dt = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    LAST_DT = dt
    LAST_REQUEST = time.monotonic()
    if query and set(query) - {"order_number", "format"}:
        raise ValueError("Query not permitted")
    query = urllib.parse.urlencode({"dt": dt, **(query or {}), "cid": os.environ["DEFINITEPLAY_CUSTOMER_ID"]})
    url = "https://definiteplay.co.uk/api/" + endpoint + "?" + query
    headers = {"User-Agent": "iGamePIN/1.0", "Accept": "application/json"}
    if authenticated:
        headers.update({"X-AUTH": SESSION_TOKEN, "X-APIKEY": os.environ["DEFINITEPLAY_API_KEY"]})
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None)
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            return response.read().decode("utf-8-sig")
    except urllib.error.HTTPError as error:
        # Never expose supplier URLs (containing cid), tokens, or response bodies.
        raise RuntimeError("Supplier HTTP " + str(error.code)) from None


def authenticate():
    global SESSION_TOKEN, SESSION_UNTIL
    if SESSION_TOKEN and time.time() < SESSION_UNTIL:
        return
    SESSION_TOKEN = supplier_request("session.php", "POST", {
        "id": os.environ["DEFINITEPLAY_SECURITY_ID"],
        "password": os.environ["DEFINITEPLAY_API_PASSWORD"],
    }, False).strip()
    if not SESSION_TOKEN or "<" in SESSION_TOKEN or len(SESSION_TOKEN) > 256:
        raise RuntimeError("Unexpected authentication response")
    SESSION_UNTIL = time.time() + 25 * 60


def normalize_item(row):
    if not isinstance(row, dict) or not SKU.fullmatch(str(row.get("sku", ""))):
        raise ValueError("Invalid supplier product code")
    price_text = str(row.get("price", ""))
    if not re.fullmatch(r"\d+(?:\.\d{1,8})?", price_text):
        raise ValueError("Invalid supplier price")
    price = Decimal(price_text)
    if not price.is_finite() or price < 0:
        raise ValueError("Invalid supplier price")
    currency = str(row.get("currency", "")).upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise ValueError("Missing supplier price currency")
    quantity = str(row.get("QtyInStock", "")).strip()
    available = quantity.lower() == "available"
    if not available and not re.fullmatch(r"\d+", quantity):
        raise ValueError("Invalid supplier stock")
    return {
        "sku": row["sku"], "name": str(row.get("product", "")),
        "brand": str(row.get("brand", "")), "region": str(row.get("region", "")),
        "cardValue": str(row.get("cardvalue", "")),
        "cardCurrency": str(row.get("cardcurrency", "")),
        "price": format(price, "f"), "currency": currency,
        "stock": None if available else int(quantity),
        "available": available or int(quantity) > 0,
        "asyncOnly": str(row.get("async_only", "")).upper() == "T",
        "deliveryMethod": str(row.get("deliverymethod", "Code")),
    }


def sync_catalogue(force=False):
    global SESSION_UNTIL
    if not SYNC_LOCK.acquire(blocking=False):
        return False
    try:
        with database() as db:
            previous = db.execute("SELECT attempted FROM sync_status WHERE id=1").fetchone()
        if previous and time.time() - previous["attempted"] < (30 if force else 300):
            return False
        with database() as db:
            db.execute("INSERT OR REPLACE INTO sync_status VALUES(1,NULL,?)", (time.time(),))
        authenticate()
        raw = json.loads(supplier_request("fetchstocklist_v2.php", "GET"))
        if not isinstance(raw, list) or not raw:
            raise ValueError("Supplier catalogue is empty or invalid")
        items = [normalize_item(row) for row in raw]
        if len({item["sku"] for item in items}) != len(items):
            raise ValueError("Duplicate supplier product codes")
        balances = json.loads(supplier_request("balances.php", "POST"))
        if not isinstance(balances, dict) or not isinstance(balances.get("Balances"), dict):
            raise ValueError("Invalid supplier balances")
        snapshot = {"items": items, "balances": balances}
        with DB_LOCK, database() as db:
            db.execute("INSERT OR REPLACE INTO snapshot VALUES(1,?,?)", (json.dumps(snapshot), time.time()))
            db.execute("UPDATE sync_status SET error=NULL WHERE id=1")
        return True
    except Exception as error:
        if "401" in str(error):
            SESSION_UNTIL = 0
        # A failed refresh retains the previous complete snapshot.
        message = str(error) if isinstance(error, (RuntimeError, ValueError, InvalidOperation)) else "Supplier refresh failed"
        if not re.fullmatch(r"[A-Za-z0-9 ._-]{1,100}", message):
            message = "Supplier refresh failed"
        with database() as db:
            db.execute("UPDATE sync_status SET error=? WHERE id=1", (message,))
        return False
    finally:
        SYNC_LOCK.release()


def load_snapshot():
    with database() as db:
        row = db.execute("SELECT payload,synced FROM snapshot WHERE id=1").fetchone()
        status = db.execute("SELECT error FROM sync_status WHERE id=1").fetchone()
    payload = json.loads(row["payload"]) if row else {"items": [], "balances": None}
    payload.update({
        "syncedAt": datetime.fromtimestamp(row["synced"], timezone.utc).isoformat() if row else None,
        "stale": not row or time.time() - row["synced"] > 900,
        "syncing": SYNC_LOCK.locked(),
        "error": status["error"] if status else None,
    })
    return payload


def save_mapping(product_id, option_id, sku):
    if not UUID.fullmatch(product_id) or not UUID.fullmatch(option_id) or not SKU.fullmatch(sku):
        raise ValueError("Invalid product link")
    snapshot = load_snapshot()
    if snapshot["stale"]:
        raise ValueError("Refresh supplier data before linking a product")
    if not any(item["sku"] == sku for item in snapshot["items"]):
        raise ValueError("Supplier product was not found")
    with DB_LOCK, database() as db:
        previous = db.execute("SELECT product_id FROM mappings WHERE option_id=?", (option_id,)).fetchone()
        if previous and previous["product_id"] != product_id:
            raise ValueError("Product option belongs to a different product")
        db.execute("INSERT OR REPLACE INTO mappings VALUES(?,?,?,?)", (option_id, product_id, sku, time.time()))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_request(self):
        configured = os.environ.get("DEFINITEPLAY_RELAY_SECRET", "")
        supplied = self.headers.get("Authorization", "")
        if not configured or not hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(),
                hashlib.sha256(("Bearer " + configured).encode()).digest()):
            return self.respond(401, {"error": "Unauthorized"})
        parsed = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if self.command == "GET" and parsed.path == "/status":
                snapshot = load_snapshot()
                count = len(snapshot.pop("items"))
                return self.respond(200, {**snapshot, "productCount": count,
                    "fulfillmentReady": os.environ.get("DEFINITEPLAY_FULFILLMENT_ENABLED") == "true" and time.time() - FULFILLMENT_HEARTBEAT < 120 and not FULFILLMENT_ERROR,
                    "fulfillmentError": FULFILLMENT_ERROR})
            if self.command == "GET" and parsed.path == "/catalogue":
                snapshot = load_snapshot()
                q = query.get("q", [""])[0][:200].casefold()
                offset = max(0, min(100000, int(query.get("offset", ["0"])[0])))
                limit = max(1, min(100, int(query.get("limit", ["30"])[0])))
                sku = query.get("sku", [""])[0]
                selected = query.get("skus", [""])[0]
                selected_skus = set(selected.split(",")) if selected else set()
                if selected and (len(selected_skus)>50 or not all(SKU.fullmatch(value) for value in selected_skus)):
                    raise ValueError("Invalid supplier selection")
                category = query.get("category", [""])[0][:200].strip().casefold()
                region = query.get("region", [""])[0][:200].strip().casefold()
                variant = query.get("variant", [""])[0]
                if variant not in ("", "regular", "discounted"):
                    raise ValueError("Invalid product version")
                # Facets come from the whole snapshot, before filtering/pagination.
                categories = sorted({i["brand"].strip() for i in snapshot["items"] if i["brand"].strip()}, key=str.casefold)
                regions = sorted({i["region"].strip() for i in snapshot["items"] if i["region"].strip()}, key=str.casefold)
                items = [i for i in snapshot["items"]
                    if (not selected_skus or i["sku"] in selected_skus)
                    and (not category or i["brand"].strip().casefold() == category)
                    and (not region or i["region"].strip().casefold() == region)
                    and (not variant or ("discounted" if re.search(r"\bdiscount(?:ed)?\b", i["name"], re.I) else "regular") == variant)
                    and (i["sku"] == sku if sku else q in " ".join([i["name"], i["sku"], i["brand"], i["region"]]).casefold())]
                return self.respond(200, {"items": items[offset:offset+limit], "total": len(items),
                    "categories": categories, "regions": regions,
                    "syncedAt": snapshot["syncedAt"], "stale": snapshot["stale"]})
            if self.command == "GET" and parsed.path == "/mappings":
                product_id = query.get("productId", [""])[0]
                if not UUID.fullmatch(product_id):
                    raise ValueError("Invalid product")
                index = {i["sku"]: i for i in load_snapshot()["items"]}
                with database() as db:
                    rows = db.execute("SELECT * FROM mappings WHERE product_id=?", (product_id,)).fetchall()
                return self.respond(200, {"mappings": [{**dict(row), "supplier": index.get(row["sku"])} for row in rows]})
            if self.command == "POST" and parsed.path == "/refresh":
                with database() as db:
                    recent = db.execute("SELECT attempted FROM sync_status WHERE id=1").fetchone()
                remaining = max(0, 30 - (time.time() - recent["attempted"])) if recent else 0
                if remaining > 0 and not SYNC_LOCK.locked():
                    return self.respond(200, {"accepted": False, "retryAfter": int(remaining) + 1})
                threading.Thread(target=sync_catalogue, kwargs={"force": True}, daemon=True).start()
                return self.respond(202, {"accepted": True})
            if parsed.path == "/mapping" and self.command in ("PUT", "DELETE"):
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 4096:
                    raise ValueError("Invalid request size")
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("Invalid request body")
                product_id = body.get("productId", "")
                option_id = body.get("optionId", "")
                if not isinstance(product_id,str) or not isinstance(option_id,str) or not UUID.fullmatch(product_id) or not UUID.fullmatch(option_id):
                    raise ValueError("Invalid product link")
                if self.command == "PUT":
                    sku = body.get("sku", "")
                    if not isinstance(sku,str):
                        raise ValueError("Invalid supplier code")
                    save_mapping(product_id, option_id, sku)
                else:
                    with DB_LOCK, database() as db:
                        db.execute("DELETE FROM mappings WHERE option_id=? AND product_id=?", (option_id,product_id))
                return self.respond(200, {"saved": True})
            self.respond(404, {"error": "Not found"})
        except (ValueError, TypeError):
            self.respond(400, {"error": "Invalid request, unavailable product, or stale catalogue. Refresh and try again."})
        except Exception:
            self.respond(503, {"error": "Supplier service unavailable"})

    do_GET = handle_request
    do_POST = handle_request
    do_PUT = handle_request
    do_DELETE = handle_request


def background_sync():
    while True:
        sync_catalogue()
        time.sleep(30)


if __name__ == "__main__":
    for key in ("DEFINITEPLAY_SECURITY_ID","DEFINITEPLAY_API_PASSWORD","DEFINITEPLAY_API_KEY","DEFINITEPLAY_CUSTOMER_ID","DEFINITEPLAY_RELAY_SECRET"):
        if not os.environ.get(key):
            raise SystemExit("Missing required service configuration")
    initialize()
    from fulfillment import Worker, Database, enabled
    if enabled():
        worker = Worker(sys.modules[__name__], Database(sys.modules[__name__]))
        threading.Thread(target=worker.run, daemon=True).start()
    threading.Thread(target=background_sync, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT","8798"))), Handler).serve_forever()
