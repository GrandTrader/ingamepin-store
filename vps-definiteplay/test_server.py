import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import server

PRODUCT = "11111111-1111-4111-8111-111111111111"
OPTION = "22222222-2222-4222-8222-222222222222"
OTHER = "33333333-3333-4333-8333-333333333333"
ROW = {"sku":"APPLE-10","product":"Apple India","price":"1.25","currency":"USD","cardcurrency":"INR","cardvalue":"100","QtyInStock":"5"}

class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.STATE = Path(self.temp.name)
        server.initialize()

    def tearDown(self):
        self.temp.cleanup()

    def snapshot(self, age=0):
        with server.database() as db:
            db.execute("INSERT OR REPLACE INTO snapshot VALUES(1,?,?)",
                (json.dumps({"items":[server.normalize_item(ROW)],"balances":{"Balances":{"Balance":{"USD":"100"}}}}),time.time()-age))

    def test_currency_and_unknown_quantity(self):
        item = server.normalize_item({**ROW,"QtyInStock":"Available"})
        self.assertEqual(item["currency"],"USD")
        self.assertEqual(item["cardCurrency"],"INR")
        self.assertIsNone(item["stock"])
        self.assertTrue(item["available"])
        self.assertFalse(server.normalize_item({**ROW,"QtyInStock":"0"})["available"])
        for changes in ({"price":"NaN"},{"currency":""},{"QtyInStock":"unknown"},{"price":"-1"}):
            with self.assertRaises(ValueError):
                server.normalize_item({**ROW,**changes})

    def test_links_require_current_known_product_and_same_parent(self):
        self.snapshot(age=901)
        with self.assertRaises(ValueError): server.save_mapping(PRODUCT,OPTION,"APPLE-10")
        self.snapshot()
        with self.assertRaises(ValueError): server.save_mapping(PRODUCT,OPTION,"MISSING")
        server.save_mapping(PRODUCT,OPTION,"APPLE-10")
        with self.assertRaises(ValueError): server.save_mapping(OTHER,OPTION,"APPLE-10")
        with server.database() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM mappings").fetchone()[0],1)

    def test_failed_refresh_keeps_last_complete_snapshot(self):
        self.snapshot()
        with patch.object(server,"authenticate"), patch.object(server,"supplier_request",return_value='[{"price":"invalid"}]'):
            self.assertFalse(server.sync_catalogue(force=True))
        self.assertEqual(server.load_snapshot()["items"][0]["sku"],"APPLE-10")
        self.assertIsNotNone(server.load_snapshot()["error"])

    def test_successful_refresh_and_throttle(self):
        with patch.object(server,"authenticate"), patch.object(server,"supplier_request",side_effect=[json.dumps([ROW]),'{"Balances":{"Balance":{"USD":"100"}}}']) as request:
            self.assertTrue(server.sync_catalogue())
            self.assertFalse(server.sync_catalogue(force=True))
            self.assertEqual(request.call_count,2)

    def test_catalogue_filters_before_pagination_and_keeps_all_facets(self):
        rows = [
            {**ROW,"sku":"A-IN","brand":"Apple","region":"India"},
            {**ROW,"sku":"A-US-1","brand":"Apple","region":"USA","product":"Apple 10 USD"},
            {**ROW,"sku":"A-US-2","brand":"Apple","region":"USA","product":"Apple 20 USD - 2% Discount"},
            {**ROW,"sku":"S-US","brand":"Steam","region":"USA","product":"Steam 10 USD"},
        ]
        with server.database() as db:
            db.execute("INSERT OR REPLACE INTO snapshot VALUES(1,?,?)",
                (json.dumps({"items":[server.normalize_item(row) for row in rows],"balances":None}),time.time()))
        with patch.dict(os.environ,{"DEFINITEPLAY_RELAY_SECRET":"test-only-secret"}):
            http = server.ThreadingHTTPServer(("127.0.0.1",0),server.Handler)
            thread = threading.Thread(target=http.serve_forever,daemon=True)
            thread.start()
            def get(query):
                url="http://127.0.0.1:"+str(http.server_port)+"/catalogue?"+query
                with urllib.request.urlopen(urllib.request.Request(url,headers={"Authorization":"Bearer test-only-secret"})) as response:
                    return json.load(response)
            try:
                page=get("category=Apple&region=USA&limit=1&offset=1")
                self.assertEqual(page["total"],2)
                self.assertEqual(page["items"][0]["sku"],"A-US-2")
                self.assertEqual(page["categories"],["Apple","Steam"])
                self.assertEqual(page["regions"],["India","USA"])
                self.assertEqual(get("category=apple&region=usa&q=10")["total"],1)
                empty=get("category=Steam&region=India")
                self.assertEqual(empty["total"],0)
                self.assertEqual(empty["categories"],["Apple","Steam"])
                self.assertEqual(get("")["total"],4)
                self.assertEqual(get("category=App")["total"],0)
                batch=get("skus=A-US-2,S-US&limit=50")
                self.assertEqual({item["sku"] for item in batch["items"]},{"A-US-2","S-US"})
                self.assertEqual(get("skus=MISSING")["total"],0)
                regular=get("category=Apple&region=USA&variant=regular")
                discounted=get("category=Apple&region=USA&variant=discounted")
                self.assertEqual([i["sku"] for i in regular["items"]],["A-US-1"])
                self.assertEqual([i["sku"] for i in discounted["items"]],["A-US-2"])
                self.assertEqual(get("variant=discounted&q=Steam")["total"],0)
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

    def test_no_order_endpoint(self):
        with self.assertRaises(ValueError):
            server.supplier_request("order_v2.php","POST",{})

    def test_http_auth_and_scoped_removal(self):
        self.snapshot()
        server.save_mapping(PRODUCT,OPTION,"APPLE-10")
        with patch.dict(os.environ,{"DEFINITEPLAY_RELAY_SECRET":"test-only-secret"}):
            http = server.ThreadingHTTPServer(("127.0.0.1",0),server.Handler)
            thread = threading.Thread(target=http.serve_forever,daemon=True)
            thread.start()
            base = "http://127.0.0.1:"+str(http.server_port)
            try:
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(base+"/status")
                self.assertEqual(denied.exception.code,401)
                headers = {"Authorization":"Bearer test-only-secret"}
                with urllib.request.urlopen(urllib.request.Request(base+"/catalogue?q=Apple",headers=headers)) as response:
                    self.assertEqual(json.load(response)["total"],1)
                with self.assertRaises(urllib.error.HTTPError) as missing:
                    urllib.request.urlopen(urllib.request.Request(base+"/order_v2.php",headers=headers,data=b"{}"))
                self.assertEqual(missing.exception.code,404)
                with server.database() as db:
                    db.execute("INSERT OR REPLACE INTO sync_status VALUES(1,NULL,?)",(time.time(),))
                with urllib.request.urlopen(urllib.request.Request(base+"/refresh",headers=headers,data=b"")) as response:
                    result=json.load(response)
                    self.assertFalse(result["accepted"])
                    self.assertGreater(result["retryAfter"],0)
                body = json.dumps({"productId":OTHER,"optionId":OPTION}).encode()
                with urllib.request.urlopen(urllib.request.Request(base+"/mapping",headers=headers,data=body,method="DELETE")):
                    pass
                with server.database() as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM mappings").fetchone()[0],1)
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

if __name__ == "__main__":
    unittest.main()
