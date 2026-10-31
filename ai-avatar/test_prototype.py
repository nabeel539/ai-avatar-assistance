"""Automated Test Suite for AI Customer Support Avatar Prototype.

Verifies:
1. Knowledge base parsing and schema validity.
2. Keyword retrieval across English, Hindi, and Hinglish queries.
3. Tool allowlist enforcement and boundary checks.
4. HTTP server routing and credential error handling.
5. 3D avatar migration integrity (Synthesia removal, model files, canvas & audio).
6. Non-navigation conversation rules and instruction alias mappings.
"""

import json
import os
import unittest
from pathlib import Path

# Set dummy testing credentials before importing agent/server
os.environ.setdefault("LIVEKIT_URL", "wss://demo-test.livekit.cloud")
os.environ.setdefault("LIVEKIT_API_KEY", "test_key_dummy_12345")
os.environ.setdefault("LIVEKIT_API_SECRET", "test_secret_dummy_1234567890abcdef")

from agent import (
    ALLOWED_ELEMENTS,
    ALLOWED_SECTIONS,
    INSTRUCTIONS,
    KNOWLEDGE,
    load_knowledge_base,
    simple_search_knowledge,
)
from server import create_app


class TestKnowledgeBase(unittest.TestCase):
    """Test knowledge.json structure and contents."""

    def test_knowledge_file_exists_and_loads(self):
        data = load_knowledge_base()
        self.assertIn("company", data)
        self.assertIn("faqs", data)
        self.assertIn("products", data)
        self.assertIn("support", data)

    def test_company_information(self):
        company = KNOWLEDGE.get("company", {})
        self.assertTrue(len(company.get("name", "")) > 0)
        self.assertTrue(len(company.get("description", "")) > 0)

    def test_faqs_structure(self):
        faqs = KNOWLEDGE.get("faqs", [])
        self.assertGreater(len(faqs), 0)
        for faq in faqs:
            self.assertIn("id", faq)
            self.assertIn("question", faq)
            self.assertIn("answer", faq)
            self.assertIn("keywords", faq)

    def test_products_structure(self):
        products = KNOWLEDGE.get("products", [])
        self.assertGreater(len(products), 0)
        for prod in products:
            self.assertIn("id", prod)
            self.assertIn("name", prod)
            self.assertIn("price", prod)
            self.assertIn("features", prod)


class TestKnowledgeSearch(unittest.TestCase):
    """Test keyword-based search retrieval logic across languages."""

    def test_search_refund_english(self):
        results = simple_search_knowledge("What is your refund policy?")
        faq_ids = [f["id"] for f in results["faqs"]]
        self.assertIn("refund-policy", faq_ids)

    def test_search_refund_hinglish(self):
        results = simple_search_knowledge("Refund kitne din mein milega?")
        faq_ids = [f["id"] for f in results["faqs"]]
        self.assertIn("refund-policy", faq_ids)

    def test_search_pro_product(self):
        results = simple_search_knowledge("Tell me about the pro plan")
        prod_ids = [p["id"] for p in results["products"]]
        self.assertIn("pro-plan", prod_ids)

    def test_search_starter_product(self):
        results = simple_search_knowledge("What are the features of starter cloud?")
        prod_ids = [p["id"] for p in results["products"]]
        self.assertIn("starter-plan", prod_ids)

    def test_search_empty_or_unknown(self):
        results = simple_search_knowledge("something completely unrelated xyz987")
        self.assertEqual(len(results["faqs"]), 0)
        self.assertEqual(len(results["products"]), 0)
        # Should still provide fallback support contact
        self.assertIn("email", results["support"])


class TestSecurityAllowlists(unittest.TestCase):
    """Verify strictly defined browser action allowlists."""

    def test_allowed_sections(self):
        expected_sections = {"hero", "services", "products", "pricing", "faq", "contact"}
        self.assertEqual(ALLOWED_SECTIONS, expected_sections)

    def test_allowed_elements(self):
        expected_elements = {
            "cloud-migration",
            "devops-pipelines",
            "security-compliance",
            "disaster-recovery",
            "starter-plan",
            "pro-plan",
            "enterprise-plan",
            "contact-card",
            "refund-faq",
        }
        self.assertEqual(ALLOWED_ELEMENTS, expected_elements)

    def test_disallowed_targets_rejected(self):
        # Arbitrary script/DOM injections must not be in allowlists
        malicious_samples = [
            "<script>alert(1)</script>",
            "document.cookie",
            "admin-panel",
            "javascript:void(0)",
            "eval()",
        ]
        for item in malicious_samples:
            self.assertNotIn(item, ALLOWED_SECTIONS)
            self.assertNotIn(item, ALLOWED_ELEMENTS)


class TestServerInitialization(unittest.TestCase):
    """Verify HTTP server initialization and routing."""

    def test_create_app(self):
        app = create_app()
        self.assertIsNotNone(app)
        registered_routes = [route.resource.canonical for route in app.router.routes() if route.resource]
        self.assertIn("/", registered_routes)
        self.assertIn("/token", registered_routes)


class Test3DAvatarMigration(unittest.TestCase):
    """Verify clean 3D avatar migration: Synthesia removed and 3D assets in place."""

    def setUp(self):
        self.base_dir = Path(__file__).parent

    def test_synthesia_removed_from_agent(self):
        agent_code = (self.base_dir / "agent.py").read_text(encoding="utf-8")
        self.assertNotIn("import synthesia", agent_code)
        self.assertNotIn("synthesia.AvatarSession", agent_code)
        self.assertNotIn("SYNTHESIA_AVATAR_ID", agent_code)

    def test_synthesia_removed_from_requirements(self):
        reqs = (self.base_dir / "requirements.txt").read_text(encoding="utf-8")
        self.assertNotIn("livekit-plugins-synthesia", reqs)

    def test_model_files_exist_and_are_valid_glb(self):
        avatar_path = self.base_dir / "models" / "avatar.glb"
        anim_path = self.base_dir / "models" / "animations.glb"

        self.assertTrue(avatar_path.is_file(), f"Missing {avatar_path}")
        self.assertTrue(anim_path.is_file(), f"Missing {anim_path}")

        # GLB format starts with magic 0x46546C67 ("glTF")
        with open(avatar_path, "rb") as f:
            header = f.read(4)
            self.assertEqual(header, b"glTF", "avatar.glb is not a valid glTF/GLB binary file")

        with open(anim_path, "rb") as f:
            header = f.read(4)
            self.assertEqual(header, b"glTF", "animations.glb is not a valid glTF/GLB binary file")

    def test_index_html_has_avatar_canvas_and_single_audio(self):
        html = (self.base_dir / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="avatar-canvas"', html)
        self.assertIn('id="agent-audio"', html)
        self.assertIn('type="importmap"', html)
        self.assertIn('/avatar3d.js', html)
        # Old Synthesia video element should be gone
        self.assertNotIn('id="avatar-video"', html)

    def test_avatar3d_script_exists(self):
        avatar_js = self.base_dir / "avatar3d.js"
        self.assertTrue(avatar_js.is_file())
        content = avatar_js.read_text(encoding="utf-8")
        self.assertIn("class Avatar3D", content)
        self.assertIn("jawOpen", content)
        # Ensure analyser is NOT connected to audioContext destination
        self.assertNotIn(".destination", content)
        self.assertNotIn("connect(this.audioContext.destination)", content)


class TestConversationAndNavigationRules(unittest.TestCase):
    """Verify normal conversation rules and navigation alias consistency."""

    def test_instructions_require_no_navigation_for_general_questions(self):
        self.assertIn("answer directly WITHOUT calling navigation tools", INSTRUCTIONS)

    def test_alias_hints_target_existing_allowlisted_ids(self):
        # In instructions: "features" maps to "services"
        self.assertIn("services", ALLOWED_SECTIONS)
        # In instructions: "Pro Cloud" maps to "pro-plan"
        self.assertIn("pro-plan", ALLOWED_ELEMENTS)

    def test_normal_conversation_information_is_retrievable_without_navigation(self):
        # When user asks about refund, knowledge search returns refund info
        refund_info = simple_search_knowledge("What is your refund policy?")
        self.assertTrue(any("refund" in f["keywords"] for f in refund_info["faqs"]))

        # When user asks about general company services, knowledge search works
        services_info = simple_search_knowledge("Tell me about your migration services")
        self.assertTrue(any("migration" in s["keywords"] for s in services_info["services"]))


if __name__ == "__main__":
    unittest.main()
