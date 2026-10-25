import hashlib
import hmac
import json
import tempfile
import ssl
import threading
import urllib.request
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch
import server

KEY = bytes.fromhex("42" * 32)
REQUEST = {"baseUrl": "https://service.wupex.com", "endpoint": "/api/customer/balance",
           "method": "GET", "apiKey": "test-only-key"}
NOW = 1792962000


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "replay.sqlite3"
        self.guard = server.ReplayGuard(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def signed(self, body, nonce="a" * 48, stamp=NOW):
        headers = {"x-wupex-timestamp": str(stamp), "x-wupex-nonce": nonce}
        headers["x-wupex-signature"] = hmac.new(KEY, (str(stamp) + "\n" + nonce + "\n").encode() + body, hashlib.sha256).hexdigest()
        return headers

    def test_only_ipv4_is_resolved_and_the_allowed_source_is_bound(self):
        addresses = [(server.socket.AF_INET, server.socket.SOCK_STREAM, 6, "", ("104.26.6.74", 443))]
        connection = Mock()
        with patch.object(server.socket, "getaddrinfo", return_value=addresses) as lookup, patch.object(server.socket, "socket", return_value=connection):
            self.assertIs(server.connect_ipv4(("service.wupex.com", 443), 12), connection)
            lookup.assert_called_once_with("service.wupex.com", 443, server.socket.AF_INET, server.socket.SOCK_STREAM)
            connection.bind.assert_called_once_with(("187.127.167.138", 0))
            connection.connect.assert_called_once_with(("104.26.6.74", 443))
            connection.settimeout.assert_called_once_with(12)
        tls = server.IPv4HTTPSConnection("service.wupex.com", timeout=12)
        self.assertEqual(tls.host, "service.wupex.com")
        self.assertTrue(tls._context.check_hostname)
        self.assertEqual(tls._context.verify_mode, ssl.CERT_REQUIRED)
        self.assertIs(tls._create_connection, server.connect_ipv4)

    def test_ipv4_failures_close_sockets_and_never_try_ipv6(self):
        addresses = [(server.socket.AF_INET, server.socket.SOCK_STREAM, 6, "", ("104.26.6.74", 443))]
        connection = Mock()
        connection.connect.side_effect = OSError("unreachable")
        with patch.object(server.socket, "getaddrinfo", return_value=addresses), patch.object(server.socket, "socket", return_value=connection):
            with self.assertRaises(OSError):
                server.connect_ipv4(("service.wupex.com", 443), 12)
            connection.close.assert_called_once()
        with patch.object(server.socket, "getaddrinfo", return_value=[]):
            with self.assertRaisesRegex(OSError, "no IPv4"):
                server.connect_ipv4(("service.wupex.com", 443), 12)

    def test_authentication_integrity_and_durable_replay_protection(self):
        body = json.dumps(REQUEST).encode()
        headers = self.signed(body)
        self.assertFalse(server.authenticate(headers, body + b" ", KEY, self.guard, NOW))
        self.assertFalse(server.authenticate(headers, body, b"x" * 32, self.guard, NOW))
        self.assertTrue(server.authenticate(headers, body, KEY, self.guard, NOW))
        self.assertFalse(server.authenticate(headers, body, KEY, server.ReplayGuard(self.path), NOW))
        self.assertFalse(server.authenticate(self.signed(body, "b" * 48, NOW - 61), body, KEY, self.guard, NOW))
        self.assertFalse(server.authenticate(self.signed(body, "c" * 48, NOW + 61), body, KEY, self.guard, NOW))

    def test_only_fixed_supplier_hosts_and_exact_api_paths(self):
        self.assertEqual(server.validate_request(REQUEST)[0], "https://service.wupex.com/api/customer/balance")
        for patch in [
            {"baseUrl": "http://service.wupex.com"}, {"baseUrl": "https://service.wupex.com.evil.test"},
            {"baseUrl": "http://127.0.0.1"}, {"baseUrl": "https://portal.wupex.com"},
            {"endpoint": "//evil.test/api/customer/balance"}, {"endpoint": "/api/customer/balance#fragment"},
            {"endpoint": "/api/customer/../order/topup"}, {"endpoint": "/api/customer/balance?url=https://evil.test"},
            {"method": "POST"}, {"body": {"a": 1}}, {"apiKey": "test\ninjection"},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                server.validate_request({**REQUEST, **patch})

    def test_queries_and_purchases_are_bounded(self):
        value = {**REQUEST, "endpoint": "/api/order/detail?referenceId=abc"}
        server.validate_request(value)
        for endpoint in ["/api/order/detail", "/api/order/detail?referenceId=a&referenceId=b", "/api/order/detail?referenceId=a&orderName=b"]:
            with self.assertRaises(ValueError):
                server.validate_request({**value, "endpoint": endpoint})
        purchase = {**REQUEST, "endpoint": "/api/order/pull-codes?referenceId=abc&allowTakeAll=false", "method": "POST",
                    "body": [{"merchant": "51144", "sku": "test", "quantity": 1}]}
        server.validate_request(purchase)
        for patch in [{"endpoint": "/api/order/pull-codes?referenceId=abc&allowTakeAll=true"},
                      {"body": [{"quantity": 2}]}, {"body": [{"quantity": 1}, {"quantity": 1}]}]:
            with self.assertRaises(ValueError):
                server.validate_request({**purchase, **patch})

    def test_http_rejects_unsigned_and_replayed_calls_before_upstream(self):
        http = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        http.signing_key = KEY
        http.replay_guard = self.guard
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        body = json.dumps(REQUEST).encode()
        url = "http://127.0.0.1:" + str(http.server_port) + "/request"
        def post(headers):
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", **headers})
            try:
                with urllib.request.urlopen(req, timeout=3) as response:
                    return response.status
            except urllib.error.HTTPError as error:
                return error.code
        try:
            with patch.object(server, "forward", return_value=(200, {"status": True, "data": {}})) as forward:
                self.assertEqual(post({}), 401)
                forward.assert_not_called()
                signed = self.signed(body, stamp=int(server.time.time()))
                self.assertEqual(post(signed), 200)
                self.assertEqual(post(signed), 401)
                self.assertEqual(forward.call_count, 1)
        finally:
            http.shutdown()
            http.server_close()
            thread.join(timeout=3)

    def response(self, body, status=200, content_type="application/json", **headers):
        r = Mock()
        r.code = status
        r.headers = {"Content-Type": content_type, **headers}
        r.read.return_value = body
        r.__enter__ = Mock(return_value=r)
        r.__exit__ = Mock(return_value=False)
        return r

    def test_forward_preserves_method_credentials_and_payload_without_retry(self):
        opener = Mock()
        opener.open.return_value = self.response(b'{"status":true,"data":{"balance":0,"currency":"USD"}}')
        status, data = server.forward(REQUEST, opener)
        self.assertEqual(status, 200)
        self.assertEqual(data["data"]["balance"], 0)
        req = opener.open.call_args.args[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertEqual(req.get_header("X-api-key"), REQUEST["apiKey"])
        self.assertEqual(opener.open.call_count, 1)
        opener.open.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            server.forward(REQUEST, opener)
        self.assertEqual(opener.open.call_count, 2)

    def test_cloudflare_error_reports_reference_without_html_or_credentials(self):
        opener = Mock()
        opener.open.return_value = self.response(b"<title>Attention Required! | Cloudflare</title>test-only-key", 403,
                                                "text/html", server="cloudflare", **{"cf-ray": "a50455e1c9713b0f-BOM"})
        status, data = server.forward(REQUEST, opener)
        self.assertEqual(status, 403)
        self.assertEqual(data, {"relayError": "UPSTREAM_CLOUDFLARE_BLOCK", "rayId": "a50455e1c9713b0f-BOM"})
        opener.open.return_value.headers["cf-ray"] = REQUEST["apiKey"]
        self.assertEqual(server.forward(REQUEST, opener)[1]["rayId"], "")

    def test_empty_authentication_errors_preserve_supplier_status(self):
        opener = Mock()
        for status in (401, 403):
            for body, content_type in [(b"", ""), (b'"Access is denied."', "application/json")]:
                opener.open.return_value = self.response(body, status, content_type)
                self.assertEqual(server.forward(REQUEST, opener), (status, {"relayError": "UPSTREAM_DENIED"}))

    def test_failed_api_responses_never_echo_keys_and_redirects_are_refused(self):
        opener = Mock()
        for body, status, expected in [(b'{"error":"test-only-key"}', 401, "UPSTREAM_DENIED"),
                                       (b'{"status":false,"description":"test-only-key"}', 200, "UPSTREAM_REJECTED"),
                                       (b'{"error":"redirect"}', 302, "UPSTREAM_REDIRECT_REFUSED"),
                                       (b'{"status":true', 200, "UPSTREAM_INVALID_RESPONSE"),
                                       (b"x" * (server.MAX_RESPONSE + 1), 200, "UPSTREAM_RESPONSE_TOO_LARGE")]:
            opener.open.return_value = self.response(body, status)
            result = server.forward(REQUEST, opener)
            self.assertEqual(result[1]["relayError"], expected)
            self.assertNotIn(REQUEST["apiKey"], json.dumps(result))
        self.assertIsNone(server.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == "__main__":
    unittest.main()
