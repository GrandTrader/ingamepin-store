"""Verified paid orders only. One durable supplier reference for every card."""
import json
import os
import re
import time
import urllib.request
from datetime import datetime
from decimal import Decimal


class Review(Exception):
    """Only fixed, safe administrator messages may be raised."""


def enabled():
    return os.environ.get("GIFTPORT_FULFILLMENT_ENABLED") == "true"


def order_request(bridge, endpoint, fields):
    # Deliberately separate from the HTTP catalogue bridge: no public buy route.
    if endpoint not in ("buy", "status"):
        raise Review("Unsupported supplier operation")
    keys = bridge.read_json("credentials.json")
    if not keys:
        raise Review("GiftPort credentials are missing")
    request = urllib.request.Request("https://giftport.in/api/giftcard/" + endpoint,
        data=json.dumps({**fields, **keys}).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.build_opener(bridge.NoRedirect()).open(request, timeout=45) as response:
            raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError()
            result = json.loads(raw, parse_float=str)
            if not isinstance(result, dict):
                raise ValueError()
            return result
    except Exception:
        # Neither upstream bodies nor URLs/credentials/recipient data are logged.
        raise RuntimeError("GiftPort confirmation unavailable") from None


def parse_status(bridge, payload, job, card):
    if not isinstance(payload, dict) or payload.get("status") != "success":
        return None
    expected = job["supplier_payload"]
    if payload.get("order_id") != card["supplier_reference"]:
        raise Review("GiftPort order reference does not match")
    if bridge.money(payload.get("amount"), positive=True) != bridge.money(expected["amount"], positive=True):
        raise Review("GiftPort card amount does not match")
    if str(payload.get("mobile", "")) != expected["mobile"] or str(payload.get("email", "")).strip().lower() != expected["recipient_email"].lower():
        raise Review("GiftPort business recipient does not match")
    tx = payload.get("transaction_id")
    if isinstance(tx, bool) or not isinstance(tx, (str, int)) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", str(tx)):
        raise Review("GiftPort transaction reference is missing")
    code = payload.get("redeem_code")
    if not isinstance(code, str) or not code.strip() or len(code) > 9500:
        return None
    code = code.strip()
    number = payload.get("card_no")
    if number is not None and number != "":
        if isinstance(number, bool) or not isinstance(number, (str, int)) or len(str(number)) > 200:
            raise Review("GiftPort card number is invalid")
        code += "\nCard number: " + str(number)
    return str(tx), code


class Database:
    def __init__(self, bridge):
        # Installers put the shared module beside this file. Repository tests use
        # the single source in vps-common without maintaining duplicate copies.
        import sys
        from pathlib import Path
        common = Path(__file__).resolve().parent.parent / "vps-common"
        if common.is_dir() and str(common) not in sys.path:
            sys.path.insert(0, str(common))
        from supplier_database import DatabaseTransport
        self.transport = DatabaseTransport(bridge, "GIFTPORT")

    def rpc(self, name, payload):
        return self.transport.rpc(name, payload)


class Worker:
    def __init__(self, bridge, db):
        self.bridge, self.db = bridge, db

    def update(self, job, state, issue):
        self.db.rpc("update_definiteplay_job", {"p_item_id": job["item_id"], "p_token": job["lease_token"], "p_state": state, "p_issue": issue})

    def snapshot(self):
        keys = self.bridge.read_json("credentials.json")
        if not keys:
            raise Review("Save GiftPort credentials first")
        return self.bridge.fetch_snapshot(keys)

    def preflight(self, job, snapshot):
        amount = self.bridge.money(job["supplier_payload"]["amount"], positive=True)
        item = next((i for i in snapshot["items"] if i["operatorCode"] == job["sku"]), None)
        if not item or item.get("currency") != "INR" or not self.bridge.amount_allowed(item, amount):
            raise Review("GiftPort denomination is no longer available")
        if snapshot.get("balance") is None or Decimal(snapshot["balance"]) < Decimal(amount):
            raise Review("Insufficient confirmed GiftPort INR balance")

    def step(self):
        job = self.db.rpc("claim_supplier_job", {"p_provider": "GIFTPORT"})
        if not job:
            return False
        submitted = bool(job.get("submitted_at"))
        args = {"p_item_id": job["item_id"], "p_token": job["lease_token"]}
        card = None
        try:
            card = self.db.rpc("next_giftport_card", args)
            if not card:
                self.db.rpc("complete_giftport_job", args)
                return True
            with self.bridge.LOCK:
                if not card.get("submitted_at"):
                    self.preflight(job, self.snapshot())
                    if not submitted:
                        self.db.rpc("mark_definiteplay_submitted", args)
                        submitted = True
                    # A timeout here MUST NOT lead to a buy. Subsequent claims
                    # query the durable card marker and only call /status.
                    self.db.rpc("mark_giftport_card_submitted", {**args, "p_ordinal": card["ordinal"]})
                    result = order_request(self.bridge, "buy", {
                        **job["supplier_payload"], "amount": float(self.bridge.money(job["supplier_payload"]["amount"], positive=True)),
                        "order_id": card["supplier_reference"], "operator_code": job["sku"]})
                    if result.get("status") == "failure":
                        raise Review("GiftPort declined the purchase; reconcile before refunding")
                    if result.get("order_id") is not None and result["order_id"] != card["supplier_reference"]:
                        raise Review("GiftPort purchase reference does not match")
                # Buy responses omit amount and recipient. Always verify via
                # authenticated status, including immediately successful buys.
                result = order_request(self.bridge, "status", {"order_id": card["supplier_reference"]})
                delivery = parse_status(self.bridge, result, job, card)
            if delivery:
                self.db.rpc("record_giftport_card", {**args, "p_ordinal": card["ordinal"], "p_transaction_id": delivery[0], "p_code": delivery[1]})
                remaining = self.db.rpc("next_giftport_card", args)
                if remaining is None:
                    self.db.rpc("complete_giftport_job", args)
                else:
                    self.update(job, "WAITING", "Preparing remaining GiftPort cards")
            else:
                since = card.get("submitted_at")
                if since and time.time() - datetime.fromisoformat(since.replace("Z", "+00:00")).timestamp() > 3600:
                    raise Review("GiftPort unresolved after one hour; reconcile before any further purchase")
                self.update(job, "UNCERTAIN", "Waiting for GiftPort confirmation; no repeat purchase")
        except Review as error:
            self.update(job, "REVIEW", str(error))
        except Exception:
            since = (card or {}).get("submitted_at") or job.get("submitted_at")
            expired = bool(since and time.time() - datetime.fromisoformat(since.replace("Z", "+00:00")).timestamp() > 3600)
            self.update(job, "UNCERTAIN" if submitted and not expired else "REVIEW", "GiftPort confirmation needs review" if expired else "GiftPort confirmation pending" if submitted else "GiftPort connection needs review")
        return True

    def sync_stock(self):
        with self.bridge.LOCK:
            snapshot = self.snapshot()
        rows = []
        for option in self.db.rpc("giftport_active_options", {}):
            amount = self.bridge.money(option["amount"], positive=True)
            item = next((i for i in snapshot["items"] if i["operatorCode"] == option["operatorCode"]), None)
            qty = 0
            if item and item.get("currency") == "INR" and self.bridge.amount_allowed(item, amount) and snapshot.get("balance") is not None:
                qty = min(int(option["limit"]), int(Decimal(snapshot["balance"]) // Decimal(amount)))
            rows.append({"optionId": option["optionId"], "quantity": qty})
        self.db.rpc("sync_giftport_stock", {"p_rows": rows})

    def run(self):
        last_sync = 0
        while True:
            try:
                if time.monotonic() - last_sync > 60:
                    self.sync_stock()
                    last_sync = time.monotonic()
                self.step()
                self.bridge.FULFILLMENT_ERROR = None
                self.bridge.FULFILLMENT_HEARTBEAT = time.time()
            except Exception:
                self.bridge.FULFILLMENT_ERROR = "GiftPort delivery connection needs attention"
            time.sleep(2)
