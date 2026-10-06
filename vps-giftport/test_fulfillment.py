import copy
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import server
import fulfillment as f


class DB:
    def __init__(self, quantity=1):
        self.job = {"item_id": "item", "lease_token": "token", "quantity": quantity, "sku": "AMZN", "submitted_at": None,
                    "supplier_payload": {"amount": "500.00", "mobile": "9876543210", "recipient_name": "Business", "recipient_email": "orders@example.test"}}
        self.cards = [{"ordinal": n, "supplier_reference": "IGP_" + str(n), "submitted_at": None, "completed_at": None} for n in range(1, quantity + 1)]
        self.calls = []
        self.timeout_marker = False
        self.delivered = False

    def rpc(self, name, body):
        self.calls.append((name, body))
        if name == "claim_supplier_job":
            return copy.deepcopy(self.job)
        if name == "next_giftport_card":
            return next((copy.deepcopy(c) for c in self.cards if not c["completed_at"]), None)
        if name == "mark_definiteplay_submitted":
            self.job["submitted_at"] = datetime.now(timezone.utc).isoformat()
        if name == "mark_giftport_card_submitted":
            c = self.cards[body["p_ordinal"] - 1]
            if c["submitted_at"]:
                raise RuntimeError("repeat purchase")
            c["submitted_at"] = datetime.now(timezone.utc).isoformat()
            if self.timeout_marker:
                self.timeout_marker = False
                raise TimeoutError()
        if name == "record_giftport_card":
            self.cards[body["p_ordinal"] - 1]["completed_at"] = True
        if name == "complete_giftport_job":
            self.delivered = True


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.db = DB()
        self.worker = f.Worker(server, self.db)
        self.snapshot = {"balance": "10000.00", "items": [{"operatorCode": "AMZN", "currency": "INR", "denominations": ["500.00"]}]}
        self.worker.snapshot = lambda: self.snapshot
        self.response = {"status": "success", "order_id": "IGP_1", "transaction_id": 998877, "amount": 500,
                         "redeem_code": "CODE", "card_no": "0001234", "mobile": "9876543210", "email": "orders@example.test"}

    def test_success_always_verifies_status(self):
        with patch.object(f, "order_request", side_effect=[{"status": "success", "order_id": "IGP_1", "redeem_code": "UNVERIFIED"}, self.response]) as request:
            self.worker.step()
        self.assertEqual([c.args[1] for c in request.call_args_list], ["buy", "status"])
        saved = next(b for n, b in self.db.calls if n == "record_giftport_card")
        self.assertEqual(saved["p_code"], "CODE\nCard number: 0001234")
        self.assertTrue(self.db.delivered)

    def test_timeout_never_buys_twice(self):
        with patch.object(f, "order_request", side_effect=TimeoutError()) as request:
            self.worker.step()
            self.assertEqual(request.call_count, 1)
        with patch.object(f, "order_request", return_value=self.response) as request:
            self.worker.step()
            self.assertEqual([c.args[1] for c in request.call_args_list], ["status"])
        self.assertTrue(self.db.delivered)

    def test_marker_timeout_does_not_buy(self):
        self.db.timeout_marker = True
        with patch.object(f, "order_request") as request:
            self.worker.step()
            request.assert_not_called()
        with patch.object(f, "order_request", return_value={"status": "failure"}) as request:
            self.worker.step()
            self.assertEqual(request.call_args.args[1], "status")
        self.assertFalse(self.db.delivered)

    def test_wrong_reference_amount_recipient_never_delivered(self):
        for key, value in [("order_id", "OTHER"), ("amount", "499.99"), ("mobile", "9999999999"), ("email", "someone@example.test"), ("transaction_id", None)]:
            with self.subTest(key=key):
                self.setUp()
                self.db.job["submitted_at"] = "2026-01-01T00:00:00+00:00"
                self.db.cards[0]["submitted_at"] = "2026-01-01T00:00:00+00:00"
                with patch.object(f, "order_request", return_value={**self.response, key: value}):
                    self.worker.step()
                self.assertFalse(self.db.delivered)
                self.assertEqual(self.db.calls[-1][1]["p_state"], "REVIEW")

    def test_preflight_blocks_missing_funds_and_wrong_currency(self):
        for snapshot in [{**self.snapshot, "balance": "499.99"}, {**self.snapshot, "balance": None}, {"balance": "10000", "items": [{"operatorCode": "AMZN", "currency": "USD", "denominations": ["500.00"]}]}]:
            with self.subTest(snapshot=snapshot):
                self.worker.snapshot = lambda: snapshot
                with patch.object(f, "order_request") as request:
                    self.worker.step()
                    request.assert_not_called()
                self.assertFalse(self.db.delivered)

    def test_multiple_cards_have_distinct_references(self):
        self.db = DB(2)
        self.worker.db = self.db
        with patch.object(f, "order_request", side_effect=[{"status": "success"}, self.response, {"status": "success"}, {**self.response, "order_id": "IGP_2", "redeem_code": "SECOND", "transaction_id": 998878}]) as request:
            self.worker.step()
            self.assertFalse(self.db.delivered)
            self.worker.step()
        buys = [c.args[2]["order_id"] for c in request.call_args_list if c.args[1] == "buy"]
        self.assertEqual(buys, ["IGP_1", "IGP_2"])
        self.assertTrue(self.db.delivered)

    def test_expired_unreachable_status_held_for_review(self):
        since = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        self.db.job["submitted_at"] = since
        self.db.cards[0]["submitted_at"] = since
        with patch.object(f, "order_request", side_effect=TimeoutError()) as request:
            self.worker.step()
            self.assertEqual(request.call_args.args[1], "status")
        self.assertEqual(self.db.calls[-1][1]["p_state"], "REVIEW")

    def test_success_without_code_not_delivered(self):
        self.db.job["submitted_at"] = datetime.now(timezone.utc).isoformat()
        self.db.cards[0]["submitted_at"] = self.db.job["submitted_at"]
        with patch.object(f, "order_request", return_value={**self.response, "redeem_code": ""}):
            self.worker.step()
        self.assertFalse(self.db.delivered)
        self.assertEqual(self.db.calls[-1][1]["p_state"], "UNCERTAIN")

    def test_failure_message_is_never_exposed(self):
        with patch.object(f, "order_request", return_value={"status": "failure", "message": "SECRET PRIVATE DATA"}):
            self.worker.step()
        self.assertNotIn("SECRET", str(self.db.calls))
        self.assertEqual(self.db.calls[-1][1]["p_state"], "REVIEW")

if __name__ == "__main__":
    unittest.main()
