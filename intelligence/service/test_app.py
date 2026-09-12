import unittest

from app import _safe_directory_candidate


class DiscoveryApiSafetyTests(unittest.TestCase):
    def test_public_directory_candidate_must_match_source_host(self):
        self.assertTrue(
            _safe_directory_candidate(
                'https://www.producthunt.com/products/alpha',
                'https://www.producthunt.com/categories/ai-software',
            )
        )
        self.assertFalse(
            _safe_directory_candidate(
                'https://www.amazon.com/products/alpha',
                'https://www.producthunt.com/categories/ai-software',
            )
        )
        self.assertFalse(
            _safe_directory_candidate(
                'http://127.0.0.1/products/alpha',
                'https://www.producthunt.com/categories/ai-software',
            )
        )
        self.assertFalse(
            _safe_directory_candidate(
                'https://www.producthunt.com/products/alpha',
                None,
            )
        )


if __name__ == '__main__':
    unittest.main()
