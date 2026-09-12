import unittest

from discovery import extract_directory_candidates


class DiscoveryParserTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            'id': 'example',
            'name': 'Example Directory',
            'url': 'https://directory-fixture.com/new',
            'candidatePathPrefixes': ['/tool/'],
            'maxCandidates': 3,
            'weight': 2.0,
        }

    def test_extracts_matching_tool_links(self):
        markdown = '[Alpha](https://directory-fixture.com/tool/alpha) [Beta](/tool/beta)'
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual([item['title'] for item in candidates], ['Alpha', 'Beta'])
        self.assertEqual(candidates[1]['url'], 'https://directory-fixture.com/tool/beta')

    def test_ignores_navigation_and_wrong_paths(self):
        markdown = '[Pricing](/tool/pricing) [Blog](/blog) [Gamma](/tool/gamma)'
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual([item['title'] for item in candidates], ['Gamma'])

    def test_deduplicates_urls(self):
        markdown = '[Alpha](/tool/alpha) [Alpha again](/tool/alpha)'
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual(len(candidates), 1)

    def test_rejects_external_absolute_candidate_url(self):
        markdown = '[Alpha](https://evil.example/tool/alpha) [Beta](/tool/beta)'
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual([item['title'] for item in candidates], ['Beta'])

    def test_respects_max_candidates(self):
        markdown = ' '.join(f'[Tool {i}](/tool/{i})' for i in range(6))
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual(len(candidates), 3)

    def test_strips_image_prefix_and_tracking_query(self):
        markdown = '[Image: Delta](https://directory-fixture.com/tool/delta?utm_source=x#hero)'
        candidates = extract_directory_candidates(markdown, self.source)
        self.assertEqual(candidates[0]['title'], 'Delta')
        self.assertEqual(candidates[0]['url'], 'https://directory-fixture.com/tool/delta')


if __name__ == '__main__':
    unittest.main()
