import copy
import json
import os
import unittest
from decimal import Decimal
from unittest.mock import patch
from open_value import normalize, preflight
from fulfillment import Worker, parse_order, Review
from test_fulfillment import FakeDB, FakeBridge, RESPONSE

ROW = {"sku": "APPLE10", "product": "Test Apple USD", "brand": "Apple", "region": "USA", "lowerLimit": "2", "upperLimit": "500", "minimumIncrement": "0.01", "cardCurrency": "USD", "discount": "2.00%"}

class RangeBridge(FakeBridge):
    def __init__(self):
        super().__init__()
        self.ranges = [copy.deepcopy(ROW)]
        self.order["order"]["order_value"] = "26.81"
        self.order["order"]["products"]["1"]["unitprice"] = "26.81"
    def supplier_request(self, name, method, body=None, **kwargs):
        if name == "fetchopencardlist.php":
            self.calls.append((name, method, body, kwargs))
            return json.dumps(self.ranges)
        return super().supplier_request(name, method, body, **kwargs)

class OpenValueTests(unittest.TestCase):
    def setUp(self):
        self.db, self.bridge = FakeDB(), RangeBridge()
        self.db.job.update(card_value="27.35", card_currency="USD", max_unit_cost="26.81")
        self.worker = Worker(self.bridge, self.db)
        self.env = patch.dict(os.environ, {"DEFINITEPLAY_RANGE_ENABLED": "true"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_exact_value_request_and_existing_code_delivery(self):
        self.worker.step()
        orders = [c for c in self.bridge.calls if c[0] == "order_v2.php"]
        self.assertEqual(orders[0][2]["line_items"], [{"sku": "APPLE10", "quantity": "1", "cardvalue": "27.35", "currency": "USD"}])
        self.assertTrue(self.db.delivered)
        self.assertNotIn("fetchstocklist_v2.php", [c[0] for c in self.bridge.calls])
        self.worker.step()
        self.assertEqual(len([c for c in self.bridge.calls if c[0] == "order_v2.php"]), 1)

    def test_ambiguous_purchase_and_database_write_never_resubmit(self):
        for mode in ("post_timeout", "save_timeout", "mark_timeout"):
            with self.subTest(mode=mode):
                db, bridge = FakeDB(), RangeBridge()
                db.job.update(self.db.job)
                setattr(bridge if mode == "post_timeout" else db, mode, True)
                worker = Worker(bridge, db)
                worker.step()
                worker.step()
                self.assertEqual(len([c for c in bridge.calls if c[0] == "order_v2.php"]), 0 if mode == "mark_timeout" else 1)
                self.assertIn("fetchorder_v2.php", [c[0] for c in bridge.calls])

    def test_processing_polls_and_checks_echoed_denomination(self):
        self.bridge.order["order"]["products"]["1"]["linestatus"] = "Processing"
        self.worker.step()
        self.assertEqual(self.db.calls[-1][1]["p_state"], "WAITING")
        self.bridge.order["order"]["products"]["1"]["linestatus"] = "Stock allocated"
        self.bridge.order["order"]["products"]["1"]["cardvalue"] = "30"
        self.worker.step()
        self.assertEqual(self.db.calls[-1][1]["p_state"], "REVIEW")
        self.assertFalse(self.db.delivered)
        self.assertEqual(len([c for c in self.bridge.calls if c[0] == "order_v2.php"]), 1)

    def test_disabled_foreign_price_change_bad_step_or_missing_product_never_purchase(self):
        for mutation in ("disabled", "foreign", "cost", "step", "missing"):
            with self.subTest(mutation=mutation):
                db, bridge = FakeDB(), RangeBridge()
                db.job.update(self.db.job)
                if mutation == "foreign": db.job["card_currency"] = "GBP"
                if mutation == "cost": bridge.ranges[0]["discount"] = "1.00%"
                if mutation == "step": bridge.ranges[0]["minimumIncrement"] = "1"
                if mutation == "missing": bridge.ranges = []
                with patch.dict(os.environ, {"DEFINITEPLAY_RANGE_ENABLED": "false" if mutation == "disabled" else "true"}):
                    Worker(bridge, db).step()
                self.assertNotIn("order_v2.php", [c[0] for c in bridge.calls])
                self.assertNotIn("mark_definiteplay_submitted", [c[0] for c in db.calls])
                self.assertEqual(db.calls[-1][1]["p_state"], "REVIEW")

    def test_decimal_increment_surcharge_funds_and_duplicate_catalogue(self):
        self.assertEqual(preflight(self.db.job, [ROW], Decimal("100"))["cardvalue"], "27.35")
        with self.assertRaises(ValueError): preflight(self.db.job, [ROW], Decimal("26.80"))
        with self.assertRaises(ValueError): normalize([ROW, ROW])
        with self.assertRaises(ValueError): normalize([{**ROW, "minimumIncrement": "NaN"}])
        surcharge = {**ROW, "lowerLimit": "1.1", "minimumIncrement": "1", "discount": "-2.50%"}
        job = {**self.db.job, "card_value": "2.1", "max_unit_cost": "2.16"}
        self.assertEqual(preflight(job, [surcharge], Decimal("100"))["cardvalue"], "2.1")

class RangeReadinessTests(unittest.TestCase):
    def test_range_sync_failure_does_not_stop_existing_worker(self):
        bridge = FakeBridge()
        worker = Worker(bridge, FakeDB())
        with patch.object(worker, "sync_stock"), patch.object(worker, "sync_ranges", side_effect=RuntimeError("Unavailable range RPC")), patch.object(worker, "step") as step, patch("fulfillment.time.monotonic", return_value=31), patch("fulfillment.time.sleep", side_effect=StopIteration), patch.dict(os.environ, {"DIGISELLER_FULFILLMENT_ENABLED": "false"}):
            with self.assertRaises(StopIteration): worker.run()
            step.assert_called_once()
            self.assertIsNone(bridge.FULFILLMENT_ERROR)
            self.assertGreater(bridge.FULFILLMENT_HEARTBEAT, 0)
            self.assertIsNotNone(bridge.RANGE_ERROR)

class OpenCatalogueTests(unittest.TestCase):
    def test_read_only_sync_and_failed_refresh_never_make_stale_catalogue_available(self):
        import tempfile
        import time
        from pathlib import Path
        import server
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "STATE", Path(folder)), patch.object(server, "authenticate"), patch.object(server, "supplier_request", return_value=json.dumps([ROW])) as request:
            server.initialize()
            self.assertTrue(server.sync_open_catalogue())
            request.assert_called_once_with("fetchopencardlist.php", "GET")
            self.assertEqual(server.load_open_snapshot()["products"][0]["sku"], ROW["sku"])
            self.assertFalse(server.load_open_snapshot()["rangeReady"])
            with patch.dict(os.environ, {"DEFINITEPLAY_RANGE_ENABLED":"true","DEFINITEPLAY_FULFILLMENT_ENABLED":"true"}), patch.object(server,"FULFILLMENT_HEARTBEAT",time.time()), patch.object(server,"RANGE_HEARTBEAT",0):
                self.assertFalse(server.load_open_snapshot()["rangeReady"], "The fixed worker heartbeat alone is not range readiness")
                with patch.object(server,"RANGE_HEARTBEAT",time.time()), patch.object(server,"RANGE_ERROR",None):
                    self.assertTrue(server.load_open_snapshot()["rangeReady"])
                    with patch.object(server,"RANGE_ERROR","Sync failed"):
                        self.assertFalse(server.load_open_snapshot()["rangeReady"])
            with server.database() as db:
                db.execute("UPDATE open_sync_status SET attempted=0")
            request.side_effect = RuntimeError("Untrusted response")
            self.assertFalse(server.sync_open_catalogue())
            self.assertTrue(server.load_open_snapshot()["stale"])
            self.assertEqual(len(server.load_open_snapshot()["products"]), 1)
            self.assertNotIn("Untrusted", str(server.load_open_snapshot()))

if __name__ == "__main__": unittest.main()
