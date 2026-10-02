"""DigiSeller reuses supplier purchasing, with isolated RPCs and no repeat buys."""
import unittest
from fulfillment import Worker, DigiSellerDatabase
from test_fulfillment import FakeDB, FakeBridge

class ExternalDatabase:
    def __init__(self):
        self.inner = FakeDB()
        self.calls = []
    def rpc(self, name, payload):
        self.calls.append((name, dict(payload)))
        reverse = {
            'claim_digiseller_supplier_job': 'claim_definiteplay_job',
            'mark_digiseller_supplier_submitted': 'mark_definiteplay_submitted',
            'update_digiseller_supplier_job': 'update_definiteplay_job',
            'complete_digiseller_supplier_job': 'complete_definiteplay_job',
        }
        data = dict(payload)
        if 'p_invoice_id' in data:
            data['p_item_id'] = data.pop('p_invoice_id')
        return self.inner.rpc(reverse[name], data)

class DigiSellerTests(unittest.TestCase):
    def test_delivery_uses_only_invoice_queue(self):
        db, bridge = ExternalDatabase(), FakeBridge()
        worker = Worker(bridge, DigiSellerDatabase(db))
        worker.step()
        self.assertTrue(db.inner.delivered)
        self.assertEqual([x[0] for x in db.calls], ['claim_digiseller_supplier_job','mark_digiseller_supplier_submitted','complete_digiseller_supplier_job'])
        self.assertIn('p_invoice_id', db.calls[-1][1])
        self.assertNotIn('p_item_id', db.calls[-1][1])
        worker.step()
        self.assertEqual([x[0] for x in bridge.calls].count('order_v2.php'), 1)
    def test_ambiguous_purchase_is_reconciled_without_repurchase(self):
        db, bridge = ExternalDatabase(), FakeBridge()
        bridge.post_timeout = True
        worker = Worker(bridge, DigiSellerDatabase(db))
        worker.step()
        self.assertEqual(db.calls[-1][1]['p_state'], 'UNCERTAIN')
        worker.step()
        self.assertTrue(db.inner.delivered)
        self.assertEqual([x[0] for x in bridge.calls].count('order_v2.php'), 1)
        self.assertEqual(bridge.calls[-1][0], 'fetchorder_v2.php')
    def test_no_invoice_means_no_spending(self):
        db, bridge = ExternalDatabase(), FakeBridge()
        db.inner.job = None
        self.assertFalse(Worker(bridge, DigiSellerDatabase(db)).step())
        self.assertEqual(bridge.calls, [])
