"""Tests for the customer-support agent hardening.

Run from the backend folder:  python -m pytest ../tests/test_support_agent.py -q
No network: Shopify, OpenAI and Supabase are replaced with fakes.
"""

import os
import unittest
from unittest import mock

os.environ.setdefault("MERCHANT_ADMIN_TOKEN", "test-admin-token")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.models.schemas import CustomerCareSettings, SupportRequestRecord  # noqa: E402
from app.services import support_guard  # noqa: E402
from app.services.conversation_service import ConversationService  # noqa: E402
from app.services.faq_service import FAQService  # noqa: E402
from app.services.shopify_service import ShopifyService  # noqa: E402
from app.services.store_knowledge_service import StoreKnowledgeService, html_to_text  # noqa: E402

settings.merchant_admin_token = "test-admin-token"


def _order_node(**overrides):
    node = {
        "id": "gid://shopify/Order/1",
        "name": "#1042",
        "createdAt": "2026-09-10T10:00:00Z",
        "updatedAt": "2026-09-12T10:00:00Z",
        "displayFinancialStatus": "PAID",
        "displayFulfillmentStatus": "FULFILLED",
        "statusPageUrl": "https://www.styledgenie.com/orders/abc",
        "email": "anna@example.com",
        "cancelledAt": None,
        "cancelReason": None,
        "returnStatus": "NO_RETURN",
        "totalRefundedSet": {"shopMoney": {"amount": "0.0", "currencyCode": "EUR"}},
        "refunds": [],
        "fulfillments": [
            {
                "displayStatus": "IN_TRANSIT",
                "status": "SUCCESS",
                "createdAt": "2026-09-11T08:00:00Z",
                "inTransitAt": "2026-09-11T12:00:00Z",
                "deliveredAt": None,
                "estimatedDeliveryAt": "2026-09-14T12:00:00Z",
                "trackingInfo": [{"company": "DHL", "number": "00340434161234567890", "url": "https://dhl.de/t/0034"}],
            }
        ],
        "currentTotalPriceSet": {"shopMoney": {"amount": "53.85", "currencyCode": "EUR"}},
        "customer": {"email": "anna@example.com"},
        "lineItems": {"nodes": []},
    }
    node.update(overrides)
    return node


class VisitorIdTests(unittest.TestCase):
    def test_legacy_shared_guest_id_is_replaced_with_unique_ids(self):
        first = support_guard.normalize_visitor_id("shopify-storefront-guest")
        second = support_guard.normalize_visitor_id("shopify-storefront-guest")
        self.assertNotEqual(first, second)
        self.assertRegex(first, support_guard.VISITOR_ID_RE)

    def test_valid_visitor_id_is_kept(self):
        visitor = support_guard.new_visitor_id()
        self.assertEqual(support_guard.normalize_visitor_id(visitor), visitor)


class OrderLookupTests(unittest.TestCase):
    def setUp(self):
        self.service = ShopifyService.__new__(ShopifyService)

    def _lookup(self, node, email="anna@example.com", reference="1042"):
        with mock.patch.object(ShopifyService, "graphql", return_value={"data": {"orders": {"nodes": [node]}}}):
            return self.service._lookup_order_support_details_live(reference, email)

    def test_returns_tracking_and_delivery_details(self):
        details = self._lookup(_order_node())
        self.assertEqual(details["order_name"], "#1042")
        shipment = details["shipments"][0]
        self.assertEqual(shipment["tracking"][0]["number"], "00340434161234567890")
        self.assertEqual(shipment["estimated_delivery_at"], "2026-09-14T12:00:00Z")

    def test_email_mismatch_reveals_nothing(self):
        self.assertIsNone(self._lookup(_order_node(), email="someone-else@example.com"))

    def test_order_without_any_email_is_never_shown(self):
        self.assertIsNone(self._lookup(_order_node(email=None, customer=None)))

    def test_order_number_must_match_exactly(self):
        self.assertIsNone(self._lookup(_order_node(name="#11042"), reference="1042"))


class OrderFactsTests(unittest.TestCase):
    def setUp(self):
        self.convo = ConversationService.__new__(ConversationService)

    def test_in_transit_order_mentions_carrier_tracking_and_estimate(self):
        details = ShopifyService.__new__(ShopifyService)
        with mock.patch.object(ShopifyService, "graphql", return_value={"data": {"orders": {"nodes": [_order_node()]}}}):
            order = details._lookup_order_support_details_live("1042", "anna@example.com")
        facts = self.convo._order_facts(order)
        text = " ".join(facts["sentences"])
        self.assertIn("DHL", text)
        self.assertIn("00340434161234567890", text)
        self.assertIn("14 September 2026", text)
        self.assertEqual(facts["tracking_url"], "https://dhl.de/t/0034")

    def test_unshipped_and_cancelled_orders(self):
        unshipped = self.convo._order_facts({"order_name": "#1", "fulfillment_status": "UNFULFILLED", "shipments": []})
        self.assertIn("hasn’t shipped yet", " ".join(unshipped["sentences"]))
        cancelled = self.convo._order_facts({"order_name": "#2", "cancelled_at": "2026-09-01T00:00:00Z", "shipments": []})
        self.assertEqual(cancelled["status_label"], "Cancelled")

    def test_refund_is_reported(self):
        facts = self.convo._order_facts(
            {"order_name": "#3", "shipments": [], "fulfillment_status": "FULFILLED",
             "total_refunded": {"amount": "41.85", "currency_code": "EUR"}}
        )
        self.assertIn("41.85 EUR", " ".join(facts["sentences"]))


class HandoffTriggerTests(unittest.TestCase):
    def setUp(self):
        self.convo = ConversationService.__new__(ConversationService)
        self.care = CustomerCareSettings()

    def test_real_requests_trigger(self):
        for text in ["I need to speak to a person", "Can I talk to a human?", "Ich möchte einen Mitarbeiter", "this is useless"]:
            self.assertTrue(self.convo._should_trigger_handoff(text, self.care), text)

    def test_no_false_positives(self):
        for text in ["Do you offer personal styling?", "Is this dress suitable for someone tall?", "track my order"]:
            self.assertFalse(self.convo._should_trigger_handoff(text, self.care), text)

    def test_reply_contains_reference_and_response_time(self):
        record = SupportRequestRecord(id="7f3a9c21-aaaa-bbbb", status="open", persisted=True)
        result = mock.Mock(email_sent=True, whatsapp_sent=False)
        reply = self.convo._build_live_handoff_reply(
            customer_care_settings=self.care,
            support_request=record,
            notification_result=result,
            shopper_email="anna@example.com",
            order_reference="1042",
        )
        self.assertIn("SG-7F3A9C21", reply)
        self.assertIn(settings.support_response_time, reply)


class PolicyQuestionTests(unittest.TestCase):
    def setUp(self):
        self.convo = ConversationService.__new__(ConversationService)

    def test_policy_questions_are_not_return_requests(self):
        for text in ["How long do I have to return an item?", "Can I return a sale item?",
                     "What is your refund policy?", "Wie lange habe ich Zeit für eine Rücksendung?"]:
            self.assertTrue(self.convo._is_policy_question(text, []), text)

    def test_real_return_requests_still_start_the_flow(self):
        for text in ["I want to return my dress", "Can I start a return for order #1042?",
                     "return order 1042 anna@example.com"]:
            self.assertFalse(self.convo._is_policy_question(text, []), text)


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        support_guard.limiter.reset()

    def test_order_lookups_lock_after_repeated_failures(self):
        visitor, ip = support_guard.new_visitor_id(), "203.0.113.9"
        for _ in range(support_guard.ORDER_FAILS_PER_VISITOR[0]):
            self.assertFalse(support_guard.order_lookup_locked(visitor, ip))
            support_guard.record_failed_order_lookup(visitor, ip)
        self.assertTrue(support_guard.order_lookup_locked(visitor, ip))

    def test_handoffs_are_capped(self):
        visitor, ip = support_guard.new_visitor_id(), "203.0.113.10"
        allowed = [support_guard.allow_handoff(visitor, ip) for _ in range(5)]
        self.assertEqual(allowed.count(True), support_guard.HANDOFFS_PER_VISITOR[0])


class FAQTests(unittest.TestCase):
    def test_generic_answer_is_detectable(self):
        faq = FAQService.__new__(FAQService)
        faq.supabase_service = mock.Mock(fetch_faqs=mock.Mock(return_value=[]))
        with mock.patch.object(FAQService, "_best_faq_match", return_value=None):
            answer = faq.answer_question("Do you sell gift wrapping?")
        self.assertTrue(faq.is_generic_answer(answer))


class StoreKnowledgeTests(unittest.TestCase):
    PAGE = """<html><head><style>.x{}</style><script>var a=1</script></head><body>
    <header>Menu Women Men</header>
    <main id="MainContent"><h1>Shipping Policy</h1>
    <h3>Germany</h3><p>Standard: €0–€59.99: €6.99. €60+: Free. ETA 0–14 business days.</p>
    <h3>Express</h3><p>€0–€79.99: €14.99. €80+: Free.</p>
    <h2>Returns</h2><p>You have 30 days from delivery to request a return.</p></main>
    <footer>© 2026</footer></body></html>"""

    def test_html_to_text_keeps_main_content_only(self):
        text = html_to_text(self.PAGE)
        self.assertIn("€60+: Free", text)
        self.assertNotIn("Menu Women Men", text)
        self.assertNotIn("var a", text)

    def test_relevant_passages_find_the_right_policy(self):
        service = StoreKnowledgeService(base_url="https://shop.test", paths=["/pages/shipping-returns"])
        with mock.patch.object(StoreKnowledgeService, "_fetch", return_value=self.PAGE):
            service.refresh()
        passages = service.relevant_passages("How much is express shipping to Germany?")
        self.assertTrue(passages)
        self.assertIn("Express", passages[0]["text"] + " ".join(p["text"] for p in passages))


class ApiSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.main import app

        cls.client = TestClient(app)

    def test_merchant_endpoints_require_admin_token(self):
        self.assertEqual(self.client.get("/api/merchant/workspace").status_code, 401)
        self.assertEqual(
            self.client.put("/api/merchant/customer-care", json={}).status_code, 401
        )
        self.assertEqual(self.client.post("/api/catalog/import", json={"store_name": "x"}).status_code, 401)

    def test_cors_only_allows_the_storefront(self):
        allowed = self.client.options(
            "/api/chat",
            headers={"Origin": "https://www.styledgenie.com", "Access-Control-Request-Method": "POST"},
        )
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "https://www.styledgenie.com")
        blocked = self.client.options(
            "/api/chat",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        self.assertIsNone(blocked.headers.get("access-control-allow-origin"))

    def test_public_storefront_config_has_no_staff_contacts(self):
        response = self.client.get("/api/storefront/config")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("escalation_contacts", response.text)


if __name__ == "__main__":
    unittest.main()
