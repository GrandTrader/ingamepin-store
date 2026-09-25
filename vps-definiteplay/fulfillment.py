"""Paid-order worker. No HTTP purchase endpoint and no retry of order submissions."""
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation


class Review(Exception):
    """Static, safe message for the administrator."""


def money(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result < 0:
            raise ValueError()
        return result
    except (InvalidOperation, ValueError, TypeError):
        raise Review("Invalid supplier amount") from None


def usd_funds(payload):
    balances = payload.get("Balances", {}) if isinstance(payload, dict) else {}
    available = balances.get("Available Balance", {})
    if not isinstance(available, dict) or "USD" not in available:
        raise Review("USD available balance is not confirmed")
    return money(available["USD"])


def stock_rows(snapshot):
    try:
        funds = usd_funds(snapshot.get("balances"))
    except Review:
        funds = Decimal(0)
    result = []
    for item in snapshot["items"]:
        cost = money(item["price"])
        quantity = 0
        if not snapshot["stale"] and item["currency"] == "USD" and cost > 0 and item["available"]:
            quantity = min(1000, item["stock"] if item["stock"] is not None else 1, int(funds // cost))
        result.append({"sku": item["sku"], "cost": str(cost), "currency": item["currency"], "quantity": quantity})
    return result


def preflight(job, items, balances):
    matches = [item for item in items if item["sku"] == job["sku"]]
    if len(matches) != 1:
        raise Review("Supplier product is unavailable")
    item = matches[0]
    cost = money(item["price"])
    if item["currency"] != "USD":
        raise Review("Supplier cost currency is not USD")
    if cost <= 0 or cost > money(job["max_unit_cost"]):
        raise Review("Supplier price changed; review the selling price")
    if not item["available"] or (item["stock"] is not None and item["stock"] < job["quantity"]):
        raise Review("Supplier has insufficient stock")
    if item["stock"] is None and job["quantity"] > 1:
        raise Review("Supplier has not confirmed the requested quantity")
    if usd_funds(balances) < cost * job["quantity"]:
        raise Review("Insufficient confirmed USD supplier balance")


def parse_order(payload, job):
    """Returns (state, codes, cost). Never include supplier text in errors."""
    if not isinstance(payload, dict) or not isinstance(payload.get("order"), dict):
        return "UNCERTAIN", [], None
    order = payload["order"]
    if order.get("order_number") != job["supplier_reference"]:
        raise Review("Supplier order reference does not match")
    products = order.get("products")
    lines = list(products.values()) if isinstance(products, dict) else products
    if not isinstance(lines, list) or len(lines) != 1 or not isinstance(lines[0], dict):
        raise Review("Supplier order lines do not match")
    line = lines[0]
    if line.get("sku") != job["sku"] or str(line.get("quantity")) != str(job["quantity"]):
        raise Review("Supplier SKU or quantity does not match")
    status = line.get("linestatus")
    if status in ("Processing", "Creating", "Part Processed", "New"):
        return "WAITING", [], None
    if status != "Stock allocated":
        # Even a rejected line can have billing implications. Never reorder it.
        raise Review("Supplier could not complete the order; reconcile with supplier")
    if order.get("currency") != "USD" or line.get("currency") != "USD":
        raise Review("Supplier order currency does not match")
    cost = money(order.get("order_value"))
    unit = money(line.get("unitprice"))
    if cost <= 0 or unit <= 0 or cost != unit * job["quantity"] or cost > money(job["max_unit_cost"]) * job["quantity"]:
        raise Review("Supplier charged a different amount; review required")
    raw_codes = line.get("codes")
    values = list(raw_codes.values()) if isinstance(raw_codes, dict) else raw_codes
    if not isinstance(values, list) or len(values) != job["quantity"]:
        raise Review("Supplier code count does not match")
    codes = []
    for value in values:
        if isinstance(value, str):
            code = value.strip()
        elif isinstance(value, dict) and isinstance(value.get("code"), str):
            code = value["code"].strip()
            if not code:
                raise Review("Supplier returned an empty code")
            for key, label in (("pin", "PIN"), ("serial", "Serial")):
                extra = value.get(key)
                if extra is not None and extra != "":
                    if not isinstance(extra, (str, int)):
                        raise Review("Invalid supplier code details")
                    code += "\n" + label + ": " + str(extra)
        else:
            raise Review("Invalid supplier code format")
        if not code or len(code) > 10000:
            raise Review("Invalid supplier code length")
        codes.append(code)
    if len(set(codes)) != len(codes):
        raise Review("Supplier returned duplicate codes")
    return "DELIVERED", codes, cost


class Database:
    def __init__(self, bridge):
        self.url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SECRET_KEY"]
        if not self.url.startswith("https://"):
            raise ValueError("Database HTTPS required")
        self.opener = urllib.request.build_opener(bridge.NoRedirect())

    def rpc(self, name, payload):
        request = urllib.request.Request(self.url + "/rest/v1/rpc/" + name,
            data=json.dumps(payload).encode(), method="POST",
            headers={"apikey": self.key, "Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=25) as response:
                body = response.read().decode()
                return json.loads(body, parse_float=str) if body else None
        except Exception:
            raise RuntimeError("Supplier database operation failed") from None


class Worker:
    def __init__(self, bridge, db):
        self.bridge = bridge
        self.db = db

    def update(self, job, state, issue):
        self.db.rpc("update_definiteplay_job", {
            "p_item_id": job["item_id"], "p_token": job["lease_token"],
            "p_state": state, "p_issue": issue})

    def step(self):
        job = self.db.rpc("claim_definiteplay_job", {})
        if not job:
            return False
        submitted = bool(job.get("submitted_at"))
        try:
            with self.bridge.SYNC_LOCK:
                self.bridge.authenticate()
                if not submitted:
                    items = [self.bridge.normalize_item(row) for row in json.loads(
                        self.bridge.supplier_request("fetchstocklist_v2.php", "GET"), parse_float=str)]
                    balances = json.loads(self.bridge.supplier_request("balances.php", "POST"), parse_float=str)
                    preflight(job, items, balances)
                    # Write-ahead submission marker. If this RPC times out, we
                    # do not send anything. The next claim reconciles by fetch.
                    self.db.rpc("mark_definiteplay_submitted", {
                        "p_item_id": job["item_id"], "p_token": job["lease_token"]})
                    submitted = True
                    raw = self.bridge.supplier_request("order_v2.php", "POST",
                        {"order_number": job["supplier_reference"],
                         "line_items": [{"sku": job["sku"], "quantity": str(job["quantity"])}]},
                        query={"format": "2"}, timeout=90)
                else:
                    raw = self.bridge.supplier_request("fetchorder_v2.php", "GET",
                        query={"order_number": job["supplier_reference"], "format": "2"}, timeout=90)
            state, codes, cost = parse_order(json.loads(raw, parse_float=str), job)
            if state == "DELIVERED":
                self.db.rpc("complete_definiteplay_job", {
                    "p_item_id": job["item_id"], "p_token": job["lease_token"],
                    "p_codes": codes, "p_actual_cost": str(cost)})
            else:
                since = job.get("submitted_at")
                if since and time.time() - datetime.fromisoformat(since.replace("Z", "+00:00")).timestamp() > 3600:
                    self.update(job, "REVIEW", "Supplier order unresolved after one hour; reconcile before any further purchase")
                else:
                    self.update(job, state, "Waiting for supplier confirmation; no repeat purchase")
        except Review as error:
            self.update(job, "REVIEW", str(error))
        except Exception as error:
            if isinstance(error, RuntimeError) and str(error) == "Supplier HTTP 401":
                self.bridge.SESSION_UNTIL = 0
            # A preflight transport failure is also held for review; an
            # uncertain submission or persistence failure is fetched only.
            self.update(job, "UNCERTAIN" if submitted else "REVIEW",
                        "Supplier confirmation pending" if submitted else "Supplier connection needs review")
        return True

    def sync_stock(self):
        snapshot = self.bridge.load_snapshot()
        self.db.rpc("sync_definiteplay_stock", {"p_rows": stock_rows(snapshot),
            "p_synced_at": snapshot["syncedAt"] or "1970-01-01T00:00:00Z"})

    def run(self):
        last_sync = 0
        while True:
            try:
                if time.monotonic() - last_sync > 30:
                    self.sync_stock()
                    last_sync = time.monotonic()
                self.step()
                self.bridge.FULFILLMENT_ERROR = None
                self.bridge.FULFILLMENT_HEARTBEAT = time.time()
            except Exception:
                # Never log supplier payloads, customer data, codes or secrets.
                self.bridge.FULFILLMENT_ERROR = "Supplier delivery connection needs attention"
            time.sleep(5)


def enabled():
    return os.environ.get("DEFINITEPLAY_FULFILLMENT_ENABLED") == "true"
