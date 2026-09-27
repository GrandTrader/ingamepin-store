"""GiftPort catalogue, import links and balance bridge; no purchasing route.

Callbacks are acknowledged, never trusted as proof of payment or delivery.
Supplier credentials stay in the service's private state directory.
"""
import hmac
import json
import os
import re
import sqlite3
from contextlib import contextmanager
import threading
import time
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATE = Path(os.environ.get("GIFTPORT_STATE_DIR", "/var/lib/ingamepin-giftport"))
LOCK = threading.RLock()
LAST_ATTEMPT = 0.0
LAST_ERROR = None
SYNCING = False
MAX_BODY = 16384


class SafeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SafeError("GiftPort redirected the request. Contact supplier support.")


def atomic_json(name, value):
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = STATE / name
    temporary = target.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600) if hasattr(os, "fchmod") else None
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(target)


def read_json(name):
    try:
        return json.loads((STATE / name).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def credentials(body):
    if not isinstance(body, dict) or set(body) != {"clientId", "secretId"}:
        raise SafeError("Enter both Client ID and Secret ID.")
    if any(not isinstance(v, str) or not v.strip() or len(v) > 512 or
           any(ord(c) < 33 or ord(c) > 126 for c in v.strip()) for v in body.values()):
        raise SafeError("Enter valid Client ID and Secret ID values without spaces.")
    return {k: v.strip() for k, v in body.items()}


def supplier_request(endpoint, keys):
    # Explicit allowlist makes accidental purchases impossible in this stage.
    if endpoint not in {"catalogue", "balance"}:
        raise SafeError("Unsupported supplier operation.")
    request = urllib.request.Request(
        "https://giftport.in/api/giftcard/" + endpoint,
        data=json.dumps(keys).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "iNgamePIN-GiftPort/1.0"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise SafeError("GiftPort returned too much data.")
            result = json.loads(raw)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise SafeError("GiftPort denied access. Check your keys and whitelist 187.127.167.138.") from None
        raise SafeError("GiftPort returned HTTP " + str(exc.code) + ". Try again later.") from None
    except SafeError:
        raise
    except Exception:
        raise SafeError("GiftPort could not be reached or returned an invalid response.") from None
    if not isinstance(result, dict) or result.get("status") != "success":
        # Upstream messages may echo credentials or recipient data.
        raise SafeError("GiftPort did not approve the request. Check API access, keys and the IP whitelist.")
    return result


def money(value, positive=False):
    """Parse explicit INR formats without guessing separators or rounding value."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise SafeError("GiftPort returned an unreadable amount.")
    text = str(value).strip()
    if len(text) > 80:
        raise SafeError("GiftPort returned an unreadable amount.")
    text = re.sub(r"^(?:INR\s*|Rs\.?\s*|₹\s*)", "", text, flags=re.I)
    if "," in text:
        # Accept conventional Indian or international thousands groups only.
        if not re.fullmatch(r"(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?", text):
            raise SafeError("GiftPort returned an unreadable amount.")
        text = text.replace(",", "")
    if not re.fullmatch(r"\d+(?:\.\d+)?", text):
        raise SafeError("GiftPort returned an unreadable amount.")
    try:
        number = Decimal(text)
        if not number.is_finite() or number > Decimal("999999999999") or (positive and number <= 0):
            raise InvalidOperation
        pennies = number.quantize(Decimal("0.01"))
        if pennies != number:
            raise InvalidOperation  # Do not silently round or truncate supplier values.
        return format(pennies, ".2f")
    except InvalidOperation:
        raise SafeError("GiftPort returned an unreadable amount.") from None


def normalize_denominations(raw):
    # In catalogue strings, commas mean separate denominations per API docs.
    # Currency grouping is only unambiguous in an individual array value.
    if isinstance(raw, str) and len(raw) <= 10000:
        parts = raw.split(",")
    elif isinstance(raw, list) and len(raw) <= 1000:
        parts = raw
    elif isinstance(raw, (int, float, Decimal)) and not isinstance(raw, bool):
        parts = [raw]
    else:
        return [], True
    values, incomplete = [], False
    for part in parts:
        if isinstance(part, str) and not part.strip():
            incomplete = True
            continue
        try:
            amount = money(part, positive=True)
        except SafeError:
            incomplete = True
            continue
        if amount not in values:
            values.append(amount)
    return ([] if incomplete else values), incomplete or not values


def normalize_variable(value):
    """Normalize flag representations; missing/unknown is not permission to vary."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return value == 1
    if isinstance(value, str):
        flag = value.strip().casefold()
        if flag in {"yes", "true", "1", "variable"}:
            return True
        if flag in {"no", "false", "0", "fixed"}:
            return False
    return None


def normalize_variable_range(raw):
    if not isinstance(raw, str) or len(raw) > 80:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*", raw)
    if not match:
        return None
    try:
        minimum, maximum = [money(v, positive=True) for v in match.groups()]
        if Decimal(minimum) > Decimal(maximum):
            return None
        return {"min": minimum, "max": maximum}
    except SafeError:
        return None


def normalize_catalogue(result):
    rows = result.get("catalogue")
    if not isinstance(rows, list) or len(rows) > 10000:
        raise SafeError("GiftPort returned an invalid catalogue.")
    items = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            raise SafeError("GiftPort returned an invalid brand.")
        code, name = row.get("operator_code"), row.get("brand_name")
        if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", code) or code in seen:
            raise SafeError("GiftPort returned an invalid or duplicate operator code.")
        if not isinstance(name, str) or not name.strip() or len(name) > 300:
            raise SafeError("GiftPort returned an invalid brand name.")
        values, incomplete = normalize_denominations(row.get("denominations"))
        variable = normalize_variable(row.get("variable_denomination", row.get("variable")))
        variable_range = normalize_variable_range(row.get("variable_denomination_range")) if variable is True else None
        category = str(row.get("category", ""))[:300]
        country = str(row.get("country", ""))[:100]
        delivery = str(row.get("delivery_type", ""))[:100]
        currency = row.get("currency_code")
        currency = currency.strip().upper() if isinstance(currency, str) else None
        if currency is not None and not re.fullmatch(r"[A-Z]{3}", currency):
            currency = None
        seen.add(code)
        items.append({"operatorCode": code, "brandName": name.strip(),
                      "denominations": values, "denominationsIncomplete": incomplete, "variable": variable,
                      "variableRange": variable_range, "currency": currency,
                      "category": category, "country": country, "deliveryType": delivery})
    return items


def fetch_snapshot(keys):
    items = normalize_catalogue(supplier_request("catalogue", keys))
    balance = supplier_request("balance", keys)
    warnings = []
    if any(item["denominationsIncomplete"] for item in items):
        warnings.append("Some brands have unconfirmed denominations. Their fixed-value lists are hidden until verified with GiftPort.")
    balance_amount = None
    if str(balance.get("currency", "")).strip().upper() != "INR":
        warnings.append("GiftPort did not confirm INR for the wallet balance. The balance is unavailable.")
    else:
        try:
            balance_amount = money(balance.get("balance"))
        except SafeError:
            warnings.append("GiftPort's wallet balance could not be read without changing its value. Check the balance in your GiftPort account.")
    return {"items": items, "balance": balance_amount, "warnings": warnings,
            "currency": "INR", "syncedAt": time.time()}


def sync_job(new_keys=None):
    global LAST_ERROR, SYNCING
    try:
        with LOCK:
            keys = new_keys or read_json("credentials.json")
        snapshot = fetch_snapshot(keys)
        with LOCK:
            # Save credentials only after both read-only supplier calls succeed.
            # Invalidate the previous account's snapshot before changing keys.
            if new_keys:
                (STATE / "snapshot.json").unlink(missing_ok=True)
                atomic_json("credentials.json", keys)
            atomic_json("snapshot.json", snapshot)
            LAST_ERROR = None
    except SafeError as exc:
        with LOCK:
            LAST_ERROR = str(exc)
    except Exception:
        with LOCK:
            LAST_ERROR = "The supplier connection could not be saved. Try again later."
    finally:
        with LOCK:
            SYNCING = False


def start_sync(new_keys=None):
    global LAST_ATTEMPT, SYNCING, LAST_ERROR
    with LOCK:
        if SYNCING or time.time() - LAST_ATTEMPT < 30:
            return False
        if new_keys is None and not read_json("credentials.json"):
            raise SafeError("Save your GiftPort credentials first.")
        LAST_ATTEMPT = time.time()
        SYNCING = True
        LAST_ERROR = None
        threading.Thread(target=sync_job, args=(new_keys,), daemon=True).start()
        return True


@contextmanager
def links_db():
    db = sqlite3.connect(STATE / "links.db", timeout=10)
    db.row_factory = sqlite3.Row
    try:
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS mappings (option_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, operator_code TEXT NOT NULL, amount TEXT NOT NULL, currency TEXT NOT NULL, updated REAL NOT NULL)")
            yield db
    finally:
        db.close()


def valid_uuid(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", value)


def amount_allowed(item, amount):
    if amount in item.get("denominations", []) and not item.get("denominationsIncomplete"):
        return True
    allowed = item.get("variableRange")
    return item.get("variable") is True and allowed is not None and Decimal(allowed["min"]) <= Decimal(amount) <= Decimal(allowed["max"])


def manage_links(body):
    if not isinstance(body, dict) or not valid_uuid(body.get("productId")):
        raise SafeError("Choose a valid website product.")
    product_id = body["productId"].lower()
    operation = body.get("operation")
    with LOCK:
        snapshot = read_json("snapshot.json")
        items = {item["operatorCode"]: item for item in (snapshot or {}).get("items", [])}
        with links_db() as db:
            if operation == "list":
                rows = db.execute("SELECT * FROM mappings WHERE product_id=? ORDER BY option_id", (product_id,)).fetchall()
                return {"mappings": [{**dict(row), "supplier": items.get(row["operator_code"])} for row in rows]}
            if operation == "remove":
                if not valid_uuid(body.get("optionId")):
                    raise SafeError("Choose a valid product option.")
                db.execute("DELETE FROM mappings WHERE product_id=? AND option_id=?", (product_id, body["optionId"].lower()))
                return {"success": True}
            if operation != "save":
                raise SafeError("Unsupported link operation.")
            if not snapshot or not 0 <= time.time() - snapshot["syncedAt"] < 900:
                raise SafeError("Refresh the GiftPort catalogue before saving links.")
            rows = body.get("mappings")
            if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
                raise SafeError("Choose between 1 and 50 options.")
            prepared, seen = [], set()
            for row in rows:
                if not isinstance(row, dict) or not valid_uuid(row.get("optionId")) or row["optionId"].lower() in seen:
                    raise SafeError("Choose unique valid product options.")
                option_id = row["optionId"].lower()
                code = row.get("operatorCode")
                item = items.get(code) if isinstance(code, str) else None
                amount = money(row.get("amount"), positive=True)
                if not item or item.get("currency") != "INR" or row.get("currency") != "INR" or not amount_allowed(item, amount):
                    raise SafeError("The denomination or currency is not confirmed in the current GiftPort catalogue.")
                existing = db.execute("SELECT product_id FROM mappings WHERE option_id=?", (option_id,)).fetchone()
                if existing and existing["product_id"] != product_id:
                    raise SafeError("This option belongs to another product link.")
                seen.add(option_id)
                prepared.append((option_id, product_id, code, amount, "INR", time.time()))
            db.executemany("INSERT INTO mappings VALUES (?,?,?,?,?,?) ON CONFLICT(option_id) DO UPDATE SET operator_code=excluded.operator_code,amount=excluded.amount,currency=excluded.currency,updated=excluded.updated", prepared)
            return {"success": True}


def periodic_sync():
    while True:
        time.sleep(300)
        try:
            start_sync()
        except Exception:
            pass  # Config/status already explains missing keys; never log them.


def status():
    with LOCK:
        snapshot = read_json("snapshot.json")
        return {"configured": bool(read_json("credentials.json")), "syncing": SYNCING,
                "error": LAST_ERROR, "purchasingEnabled": False,
                "stale": not snapshot or time.time() - snapshot["syncedAt"] > 900,
                "snapshot": snapshot}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass  # No URLs, bodies, API keys, or callback payloads in access logs.

    def respond(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        if self.headers.get("Transfer-Encoding"):
            raise SafeError("Unsupported request encoding.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise SafeError("Invalid request length.") from None
        if length < 0 or length > MAX_BODY:
            raise SafeError("Request is too large.")
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise SafeError("Incomplete request.")
        return raw

    def handle_request(self):
        try:
            if self.path == "/callback":
                if self.command == "GET":
                    return self.respond(200, {"status": "ready", "purchasingEnabled": False})
                if self.command == "POST":
                    self.read_body()
                    # Onboarding receiver only. Never save bodies or trigger orders.
                    # Fulfilment requires authenticated status verification later.
                    return self.respond(200, {"status": "received", "processed": False})
            secret = os.environ.get("GIFTPORT_RELAY_SECRET", "")
            supplied = self.headers.get("Authorization", "")
            if not secret or not hmac.compare_digest(supplied.encode(), ("Bearer " + secret).encode()):
                return self.respond(401, {"error": "Unauthorized"})
            if self.command == "GET" and self.path == "/status":
                return self.respond(200, status())
            if self.command == "POST" and self.path == "/links":
                return self.respond(200, manage_links(json.loads(self.read_body())))
            if self.command == "POST" and self.path in ("/configure", "/refresh"):
                raw = self.read_body()
                keys = credentials(json.loads(raw)) if self.path == "/configure" else None
                if not start_sync(keys):
                    return self.respond(429, {"error": "Wait 30 seconds before trying again."})
                return self.respond(202, {"accepted": True})
            return self.respond(404, {"error": "Not found"})
        except SafeError as exc:
            self.respond(400, {"error": str(exc)})
        except (ValueError, TypeError):
            self.respond(400, {"error": "Invalid request."})
        except Exception:
            self.respond(500, {"error": "Supplier bridge unavailable."})

    do_GET = handle_request
    do_POST = handle_request


if __name__ == "__main__":
    if not os.environ.get("GIFTPORT_RELAY_SECRET"):
        raise SystemExit("Missing private relay configuration")
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    threading.Thread(target=periodic_sync, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 8800), Handler).serve_forever()
