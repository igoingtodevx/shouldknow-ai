import unittest

from core import AUTO_PUBLISH_P0, classify, normalize


class NormalizationTests(unittest.TestCase):
    def test_first_tracking_parameter_preserves_remaining_query(self):
        self.assertEqual(
            normalize("https://example.test/page?utm_source=one&ref=keep"),
            "https://example.test/page?ref=keep",
        )

    def test_compact_consent_buttons_are_noise(self):
        self.assertEqual(normalize("AcceptAll"), "")
        self.assertEqual(normalize("RejectAll"), "")

    def test_dynamic_link_table_metrics_are_stable(self):
        first = (
            '| [Next.js](https://context7.com/vercel/next.js) | '
            '[/vercel/next.js](https://github.com/vercel/next.js) | 87.7 | 5.6K | 15 hours | |'
        )
        second = (
            '| [Next.js](https://context7.com/vercel/next.js) | '
            '[/vercel/next.js](https://github.com/vercel/next.js) | 88.2 | 5.6K | 16 hours | |'
        )
        self.assertEqual(normalize(first), normalize(second))

    def test_pricing_amount_only_diff_is_p0(self):
        materiality, _ = classify(
            {"changed": True, "removed": ["| $20 |"], "added": ["| $25 |"]}
        )
        self.assertEqual(materiality, "P0")

    def test_cosmetic_diff_is_p2(self):
        materiality, _ = classify(
            {"changed": True, "removed": ["spacing old"], "added": ["spacing new"]}
        )
        self.assertEqual(materiality, "P2")

    def test_shadow_mode_is_fail_closed(self):
        self.assertFalse(AUTO_PUBLISH_P0)


if __name__ == "__main__":
    unittest.main()
