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

    def test_live_catalogue_field_names_and_ranges(self):
        row = {**CATALOGUE["catalogue"][0], "variable_denomination": "Yes",
               "variable_denomination_range": "1000-10000", "currency_code": "INR"}
        row.pop("variable")
        item = server.normalize_catalogue({"catalogue": [row]})[0]
        self.assertIs(item["variable"], True)
        self.assertEqual(item["variableRange"], {"min": "1000.00", "max": "10000.00"})
        self.assertEqual(item["currency"], "INR")
        row["variable_denomination"] = "No"
        item = server.normalize_catalogue({"catalogue": [row]})[0]
        self.assertIs(item["variable"], False)
        self.assertIsNone(item["variableRange"])

    def test_invalid_ranges_never_imply_allowed_purchase_values(self):
        for raw in (None, "-", "10000-1000", "0-100", "100-NaN", "100.001-200", "100 to 200"):
            with self.subTest(raw=raw):
                self.assertIsNone(server.normalize_variable_range(raw))
        values, incomplete = server.normalize_denominations("2,00,01,000")
        self.assertEqual(values, [])
        self.assertTrue(incomplete)

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
        self.assertEqual(values, [])
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

    def link_fixture(self):
        item = server.normalize_catalogue({"catalogue": [{**CATALOGUE["catalogue"][0], "currency_code": "INR", "variable_denomination": "Yes", "variable_denomination_range": "100-10000"}]})[0]
        server.atomic_json("snapshot.json", {"items": [item], "syncedAt": server.time.time()})
        return {"operation": "save", "productId": "11111111-1111-4111-8111-111111111111", "mappings": [{"optionId": "22222222-2222-4222-8222-222222222222", "operatorCode": "AMZN", "amount": "500", "currency": "INR"}]}

    def test_links_persist_and_support_confirmed_variable_values(self):
        body = self.link_fixture()
        body["mappings"][0]["amount"] = "750"
        self.assertTrue(server.manage_links(body)["success"])
        result = server.manage_links({"operation": "list", "productId": body["productId"]})
        self.assertEqual(result["mappings"][0]["amount"], "750.00")
        self.assertEqual(result["mappings"][0]["supplier"]["operatorCode"], "AMZN")
        # Retrying the same update does not create another link.
        server.manage_links(body)
        self.assertEqual(len(server.manage_links({"operation": "list", "productId": body["productId"]})["mappings"]), 1)

    def test_links_reject_stale_currency_and_unconfirmed_amounts(self):
        body = self.link_fixture()
        for change in ({"amount": "10001"}, {"amount": "0"}, {"currency": "USD"}, {"operatorCode": "MISSING"}):
            with self.subTest(change=change), self.assertRaises(server.SafeError):
                server.manage_links({**body, "mappings": [{**body["mappings"][0], **change}]})
        snapshot = server.read_json("snapshot.json")
        snapshot["syncedAt"] -= 1000
        server.atomic_json("snapshot.json", snapshot)
        with self.assertRaises(server.SafeError):
            server.manage_links(body)

    def test_invalid_batch_does_not_save_partial_links(self):
        body = self.link_fixture()
        body["mappings"].append({**body["mappings"][0], "optionId": "33333333-3333-4333-8333-333333333333", "amount": "99999"})
        with self.assertRaises(server.SafeError):
            server.manage_links(body)
        self.assertEqual(server.manage_links({"operation": "list", "productId": body["productId"]})["mappings"], [])

    def test_links_cannot_be_reassigned_or_removed_by_another_product(self):
        body = self.link_fixture()
        server.manage_links(body)
        other = "44444444-4444-4444-8444-444444444444"
        with self.assertRaises(server.SafeError):
            server.manage_links({**body, "productId": other})
        server.manage_links({"operation": "remove", "productId": other, "optionId": body["mappings"][0]["optionId"]})
        self.assertEqual(len(server.manage_links({"operation": "list", "productId": body["productId"]})["mappings"]), 1)
        server.manage_links({"operation": "remove", "productId": body["productId"], "optionId": body["mappings"][0]["optionId"]})
        self.assertEqual(server.manage_links({"operation": "list", "productId": body["productId"]})["mappings"], [])

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
                request = urllib.request.Request(base + "/links", data=b'{}')
                with self.assertRaises(urllib.error.HTTPError) as private_links:
                    urllib.request.urlopen(request)
                self.assertEqual(private_links.exception.code, 401)
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
