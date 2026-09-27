import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
import server

CATALOGUE = {"status": "success", "catalogue": [{"operator_code": "AMZN", "brand_name": "Amazon Pay Gift Card", "denominations": "100,500,1000", "variable": "Yes"}]}
BALANCE = {"status": "success", "currency": "INR", "balance": 9892.20}
KEYS = {"clientId": "test-client", "secretId": "test-secret"}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state = patch.object(server, "STATE", Path(self.temp.name))
        self.state.start()
        server.SYNCING = False
        server.LAST_ERROR = None
        server.LAST_ATTEMPT = 0

    def tearDown(self):
        self.state.stop()
        self.temp.cleanup()

    def test_catalogue_face_values_and_no_invented_stock(self):
        rows = server.normalize_catalogue(CATALOGUE)
        self.assertEqual(rows[0]["denominations"], ["100.00", "500.00", "1000.00"])
        self.assertNotIn("stock", rows[0])
        self.assertNotIn("price", rows[0])

    def test_variable_flag_formats(self):
        for value in ("Yes", "yes", " YES ", "true", "TRUE", "1", "Variable", True, 1):
            with self.subTest(value=value):
                self.assertIs(server.normalize_variable(value), True)
        for value in ("No", "no", " NO ", "false", "FALSE", "0", "Fixed", False, 0):
            with self.subTest(value=value):
                self.assertIs(server.normalize_variable(value), False)

    def test_unknown_flags_do_not_block_other_brands_or_imply_permission(self):
        for value in (None, "", "unknown", "sometimes", 2, [], {}):
            with self.subTest(value=value):
                row = {**CATALOGUE["catalogue"][0], "operator_code": "OTHER", "variable": value}
                items = server.normalize_catalogue({"catalogue": [*CATALOGUE["catalogue"], row]})
                self.assertEqual(len(items), 2)
                self.assertIs(items[0]["variable"], True)
                self.assertIsNone(items[1]["variable"])
                self.assertEqual(items[1]["denominations"], ["100.00", "500.00", "1000.00"])
        row = dict(CATALOGUE["catalogue"][0])
        row.pop("variable")
        self.assertIsNone(server.normalize_catalogue({"catalogue": [row]})[0]["variable"])

    def test_invalid_amounts_rejected(self):
        for value in (True, -1, "NaN", "Infinity", "1.001", "1e2", None):
            with self.subTest(value=value), self.assertRaises(server.SafeError):
                server.money(value)

    def test_duplicate_operator_rejected(self):
        with self.assertRaises(server.SafeError):
            server.normalize_catalogue({"catalogue": CATALOGUE["catalogue"] * 2})

    def test_non_inr_balance_is_unavailable_not_converted(self):
        with patch.object(server, "supplier_request", side_effect=[CATALOGUE, {**BALANCE, "currency": "USD"}]):
            snapshot = server.fetch_snapshot(KEYS)
        self.assertIsNone(snapshot["balance"])
        self.assertTrue(snapshot["warnings"])
        self.assertEqual(len(snapshot["items"]), 1)

    def test_amount_formats_preserve_exact_value(self):
        cases = [(" 500.0000 ", "500.00"), ("INR 1,23,456.00", "123456.00"),
                 ("₹1,234.50", "1234.50"), ("Rs. 1000.00", "1000.00"),
                 ("0.000000", "0.00"), (500.0, "500.00")]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(server.money(value), expected)
        for value in ("1,23", "USD 500", "500.0001", "12,34,56", "-1", "100-500"):
            with self.subTest(value=value), self.assertRaises(server.SafeError):
                server.money(value)

    def test_denominations_do_not_infer_ranges_or_include_zero(self):
        values, incomplete = server.normalize_denominations("0,100,500.0000,100-1000,invalid")
        self.assertEqual(values, ["100.00", "500.00"])
        self.assertTrue(incomplete)
        self.assertEqual(server.normalize_denominations([100, "500.000", "INR 1,000"]),
                         (["100.00", "500.00", "1000.00"], False))
        for value in (None, {}, "100-1000", "", True):
            with self.subTest(value=value):
                self.assertEqual(server.normalize_denominations(value), ([], True))

    def test_successful_api_access_with_bad_amount_keeps_usable_connection(self):
        catalogue = {"catalogue": [{**CATALOGUE["catalogue"][0], "denominations": "0,100-10000"}]}
        with patch.object(server, "supplier_request", side_effect=[catalogue, {**BALANCE, "balance": "unknown"}]):
            server.sync_job(KEYS)
        result = server.status()
        self.assertTrue(result["configured"])
        self.assertIsNone(result["error"])
        self.assertIsNone(result["snapshot"]["balance"])
        self.assertTrue(result["snapshot"]["warnings"])
        self.assertTrue(result["snapshot"]["items"][0]["denominationsIncomplete"])
        self.assertFalse(result["purchasingEnabled"])

    def test_connect_saves_keys_only_after_success(self):
        with patch.object(server, "supplier_request", side_effect=[CATALOGUE, BALANCE]) as call:
            server.sync_job(KEYS)
        self.assertEqual([c.args[0] for c in call.call_args_list], ["catalogue", "balance"])
        result = server.status()
        self.assertTrue(result["configured"])
        self.assertEqual(result["snapshot"]["balance"], "9892.20")
        self.assertNotIn("test-secret", json.dumps(result))
        self.assertFalse(result["purchasingEnabled"])

    def test_failed_key_change_keeps_previous_account(self):
        server.atomic_json("credentials.json", KEYS)
        server.atomic_json("snapshot.json", {"syncedAt": 1, "balance": "123.00"})
        with patch.object(server, "supplier_request", side_effect=server.SafeError("Access denied")):
            server.sync_job({"clientId": "new", "secretId": "bad"})
        self.assertEqual(server.read_json("credentials.json"), KEYS)
        self.assertEqual(server.status()["snapshot"]["balance"], "123.00")
        self.assertTrue(server.status()["stale"])

    def test_buy_never_reaches_network(self):
        with patch.object(server.urllib.request, "build_opener") as network:
            with self.assertRaises(server.SafeError):
                server.supplier_request("buy", KEYS)
            network.assert_not_called()

    def test_credential_validation(self):
        for body in ({}, {**KEYS, "url": "https://evil.example"}, {**KEYS, "secretId": "a\nb"}):
            with self.assertRaises(server.SafeError):
                server.credentials(body)

    def test_supplier_uses_post_body_and_blocks_redirects(self):
        with patch.object(server.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(BALANCE).encode()
            server.supplier_request("balance", KEYS)
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "POST")
            self.assertNotIn("test-secret", request.full_url)
            self.assertEqual(json.loads(request.data), KEYS)
        with self.assertRaises(server.SafeError):
            server.NoRedirect().redirect_request(None, None, 302, None, None, "https://evil.example")

    def test_http_boundary_callback_cannot_fulfil(self):
        with patch.dict(server.os.environ, {"GIFTPORT_RELAY_SECRET": "relay-test"}):
            http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            base = "http://127.0.0.1:" + str(http.server_port)
            try:
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(base + "/status")
                self.assertEqual(denied.exception.code, 401)
                request = urllib.request.Request(base + "/callback", data=b'{"status":"success","redeem_code":"untrusted"}')
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(json.load(response), {"status": "received", "processed": False})
                self.assertEqual(list(Path(self.temp.name).iterdir()), [])
                request = urllib.request.Request(base + "/buy", data=b"{}", headers={"Authorization": "Bearer relay-test"})
                with self.assertRaises(urllib.error.HTTPError) as missing:
                    urllib.request.urlopen(request)
                self.assertEqual(missing.exception.code, 404)
                request = urllib.request.Request(base + "/callback", data=b"x" * (server.MAX_BODY + 1))
                with self.assertRaises(urllib.error.HTTPError) as large:
                    urllib.request.urlopen(request)
                self.assertEqual(large.exception.code, 400)
            finally:
                http.shutdown()
                http.server_close()


if __name__ == "__main__":
    unittest.main()
