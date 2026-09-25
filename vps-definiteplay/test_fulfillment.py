"""No network and no real supplier purchases."""
import copy
import json
import threading
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from fulfillment import Worker, Review, parse_order, preflight, stock_rows, usd_funds

JOB = {"item_id": "item", "lease_token": "lease", "supplier_reference": "IGPDPtest",
       "sku": "APPLE10", "quantity": 1, "max_unit_cost": "9.80", "submitted_at": None}
ITEM = {"sku": "APPLE10", "price": "9.80", "currency": "USD", "available": True, "stock": 10}
BALANCE = {"Balances": {"Available Balance": {"USD": "100.00"}}}
RESPONSE = {"order": {"order_number": "IGPDPtest", "order_value": "9.80", "currency": "USD",
    "products": {"1": {"sku": "APPLE10", "quantity": "1", "unitprice": "9.80", "currency": "USD",
        "linestatus": "Stock allocated", "codes": {"1": {"code": "TEST-CODE", "pin": "123", "serial": "456"}}}}}}


class FakeDB:
    def __init__(self):
        self.job = copy.deepcopy(JOB)
        self.calls = []
        self.delivered = None
        self.mark_timeout = False
        self.save_timeout = False

    def rpc(self, name, payload):
        self.calls.append((name, copy.deepcopy(payload)))
        if name == "claim_definiteplay_job":
            return copy.deepcopy(self.job) if self.job and not self.delivered else None
        if name == "mark_definiteplay_submitted":
            self.job["submitted_at"] = datetime.now(timezone.utc).isoformat()
            if self.mark_timeout:
                raise TimeoutError()
        if name == "complete_definiteplay_job":
            if self.save_timeout:
                self.save_timeout = False
                raise TimeoutError()
            self.delivered = payload["p_codes"]


class FakeBridge:
    def __init__(self):
        self.SYNC_LOCK = threading.Lock()
        self.calls = []
        self.order = copy.deepcopy(RESPONSE)
        self.post_timeout = False

    def authenticate(self):
        pass

    def normalize_item(self, row):
        return row

    def supplier_request(self, name, method, body=None, **kwargs):
        self.calls.append((name, method, body, kwargs))
        if name == "fetchstocklist_v2.php":
            return json.dumps([ITEM])
        if name == "balances.php":
            return json.dumps(BALANCE)
        if name == "order_v2.php" and self.post_timeout:
            raise TimeoutError("Untrusted URL with secret")
        return json.dumps(self.order)


class FulfillmentTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.bridge = FakeBridge()
        self.worker = Worker(self.bridge, self.db)

    def test_no_claim_means_no_supplier_calls(self):
        self.db.job = None
        self.assertFalse(self.worker.step())
        self.assertEqual(self.bridge.calls, [])

    def test_mark_before_post_and_codes_saved_with_pin(self):
        self.worker.step()
        self.assertEqual(self.db.delivered, ["TEST-CODE\nPIN: 123\nSerial: 456"])
        self.assertEqual([c[0] for c in self.db.calls], [
            "claim_definiteplay_job", "mark_definiteplay_submitted", "complete_definiteplay_job"])
        request = [c for c in self.bridge.calls if c[0] == "order_v2.php"][0]
        self.assertEqual(request[2]["order_number"], JOB["supplier_reference"])
        self.assertEqual(request[3], {"query": {"format": "2"}, "timeout": 90})
        self.worker.step()
        self.assertEqual(len([c for c in self.bridge.calls if c[0] == "order_v2.php"]), 1)

    def test_timeout_fetches_never_posts_twice(self):
        self.bridge.post_timeout = True
        self.worker.step()
        self.assertEqual(self.db.calls[-1][1]["p_state"], "UNCERTAIN")
        self.worker.step()
        self.assertTrue(self.db.delivered)
        self.assertEqual([c[0] for c in self.bridge.calls].count("order_v2.php"), 1)
        self.assertEqual(self.bridge.calls[-1][0], "fetchorder_v2.php")
        self.assertNotIn("secret", json.dumps(self.db.calls))

    def test_mark_response_lost_never_posts(self):
        self.db.mark_timeout = True
        self.worker.step()
        self.assertNotIn("order_v2.php", [c[0] for c in self.bridge.calls])
        self.assertEqual(self.db.calls[-1][1]["p_state"], "REVIEW")

    def test_delivery_write_failure_fetches_original(self):
        self.db.save_timeout = True
        self.worker.step()
        self.worker.step()
        self.assertTrue(self.db.delivered)
        self.assertEqual([c[0] for c in self.bridge.calls].count("order_v2.php"), 1)

    def test_async_missing_and_duplicate_response_reconcile(self):
        self.bridge.order["order"]["products"]["1"]["linestatus"] = "Processing"
        self.worker.step()
        self.assertEqual(self.db.calls[-1][1]["p_state"], "WAITING")
        for response in ({"success": True, "message": "order number not found"},
                         {"success": False, "message": "Order number used previously"}):
            self.bridge.order = response
            self.worker.step()
            self.assertEqual(self.db.calls[-1][1]["p_state"], "UNCERTAIN")
        self.assertEqual([c[0] for c in self.bridge.calls].count("order_v2.php"), 1)

    def test_identity_cost_currency_and_codes_must_match(self):
        mutations = [
            ("order", "order_number", "different"), ("order", "currency", "GBP"),
            ("order", "order_value", "11.00"), ("line", "sku", "OTHER"),
            ("line", "quantity", "2"), ("line", "currency", "GBP"),
            ("line", "unitprice", "NaN"), ("line", "codes", []),
            ("line", "linestatus", "Cancelled")]
        for where, key, value in mutations:
            payload = copy.deepcopy(RESPONSE)
            target = payload["order"] if where == "order" else payload["order"]["products"]["1"]
            target[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(Review):
                parse_order(payload, JOB)

    def test_cost_balance_and_stock_preflight(self):
        preflight(JOB, [ITEM], BALANCE)
        for item in ({**ITEM, "currency": "GBP"}, {**ITEM, "price": "9.81"},
                     {**ITEM, "stock": 0}, {**ITEM, "available": False}):
            with self.assertRaises(Review):
                preflight(JOB, [item], BALANCE)
        for balance in ({"Balances": {"Available Balance": {"GBP": "1000"}}},
                        {"Balances": {"Available Balance": {"USD": "9"}}}):
            with self.assertRaises(Review):
                preflight(JOB, [ITEM], balance)

    def test_stock_sync_stale_unknown_and_balance_cap(self):
        snapshot = {"items": [ITEM], "balances": BALANCE, "stale": False}
        self.assertEqual(stock_rows(snapshot)[0]["quantity"], 10)
        snapshot["stale"] = True
        self.assertEqual(stock_rows(snapshot)[0]["quantity"], 0)
        snapshot["stale"] = False
        snapshot["items"] = [{**ITEM, "stock": None}]
        self.assertEqual(stock_rows(snapshot)[0]["quantity"], 1)
        snapshot["balances"] = {"Balances": {"Available Balance": {"GBP": "1000"}}}
        self.assertEqual(stock_rows(snapshot)[0]["quantity"], 0)

    def test_submission_disabled_by_default(self):
        import server
        with patch.dict("os.environ", {"DEFINITEPLAY_FULFILLMENT_ENABLED": "false"}):
            with self.assertRaises(ValueError):
                server.supplier_request("order_v2.php", "POST", {})


if __name__ == "__main__":
    unittest.main()
