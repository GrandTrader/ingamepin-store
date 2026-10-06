import io
import json
import os
import unittest
import urllib.request
from unittest.mock import patch
from supplier_database import DatabaseTransport

class Bridge:
    NoRedirect = urllib.request.HTTPRedirectHandler
class Reply(io.BytesIO):
    pass
class Opener:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []
    def open(self, request, timeout):
        self.calls.append((request, timeout))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception): raise reply
        return Reply(reply)
class Tests(unittest.TestCase):
    def database(self, replies, enabled=True):
        with patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL":"https://db.example.test",
            "SUPABASE_SECRET_KEY":"database-private", "DEFINITEPLAY_RELAY_SECRET":"s"*40,
            "SUPPLIER_DATABASE_BACKUP_ENABLED":"true" if enabled else "false"}):
            db = DatabaseTransport(Bridge, "DEFINITEPLAY")
        db.opener = Opener(replies)
        return db
    def test_disabled_preserves_direct_route(self):
        db = self.database([b'null'], False)
        self.assertIsNone(db.rpc("claim_definiteplay_job", {}))
        self.assertEqual(len(db.opener.calls), 1)
        self.assertIn("db.example.test", db.opener.calls[0][0].full_url)
    def test_failed_probe_uses_backup_and_cache(self):
        db = self.database([TimeoutError(), b'{"ready":true}', b'null', b'0.123456789123456789'])
        self.assertIsNone(db.rpc("claim_definiteplay_job", {}))
        self.assertEqual(db.rpc("sync_definiteplay_stock", {}), '0.123456789123456789')
        self.assertEqual([r.method for r,t in db.opener.calls], ["HEAD","GET","POST","POST"])
        for request,timeout in db.opener.calls[1:]:
            self.assertNotIn("database-private", str(request.headers))
            self.assertNotIn("s"*40, str(request.headers))
            self.assertIn("X-supplier-signature", request.headers)
    def test_direct_write_timeout_is_never_replayed(self):
        db = self.database([b'', TimeoutError()])
        with self.assertRaisesRegex(RuntimeError, "Supplier database operation failed"):
            db.rpc("mark_definiteplay_submitted", {})
        self.assertEqual(len(db.opener.calls),2)
        self.assertIsNone(db.route)
    def test_backup_write_timeout_is_never_replayed(self):
        db = self.database([TimeoutError(), b'{"ready":true}', TimeoutError()])
        with self.assertRaises(RuntimeError): db.rpc("mark_definiteplay_submitted", {})
        self.assertEqual(len(db.opener.calls),3)
    def test_both_down_never_send_rpc(self):
        db = self.database([TimeoutError(),TimeoutError()])
        with self.assertRaises(RuntimeError): db.rpc("claim_definiteplay_job", {})
        self.assertEqual([r.method for r,t in db.opener.calls], ["HEAD","GET"])
    def test_recovers_direct_after_cache_expires(self):
        db = self.database([TimeoutError(), b'{"ready":true}', b'null', b'', b'null'])
        db.rpc("claim_definiteplay_job", {})
        db.check_at = 0
        db.rpc("claim_definiteplay_job", {})
        self.assertEqual(db.route,"direct")
        self.assertIn("db.example.test", db.opener.calls[-1][0].full_url)
    def test_unhealthy_backup_does_not_receive_rpc(self):
        db = self.database([TimeoutError(), b'{"ready":false}'])
        with self.assertRaises(RuntimeError): db.rpc("claim_definiteplay_job", {})
        self.assertEqual(len(db.opener.calls),2)
if __name__ == "__main__": unittest.main()
