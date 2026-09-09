import unittest
from app.core import classify_materiality, content_hash, make_diff, normalize_markdown, safe_public_url

class CoreTests(unittest.TestCase):
    def test_normalization_is_stable(self):
        self.assertEqual(normalize_markdown("a  \r\n\r\n\r\nb\t c"), "a\n\nb c")
        self.assertEqual(content_hash("a\r\n\nb"), content_hash("a\n\nb"))

    def test_diff_detects_breaking_change(self):
        diff = make_diff("Endpoint logs.all is available", "Endpoint logs.all is removed. Migration required.")
        result = classify_materiality(diff, "changelog")
        self.assertGreaterEqual(result.score, 45)
        self.assertEqual(result.kind, "breaking")

    def test_safe_url_rejects_internal_targets(self):
        for url in ("http://127.0.0.1/x", "http://10.0.0.1", "file:///etc/passwd", "http://localhost:8080"):
            self.assertFalse(safe_public_url(url), url)
        self.assertTrue(safe_public_url("https://example.com/changelog"))

if __name__ == "__main__":
    unittest.main()
