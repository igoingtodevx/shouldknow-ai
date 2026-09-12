import contextlib
import io
import sys
import unittest
from unittest.mock import patch

from worker import DiscoveryRunResult, CrawlRunResult, _directory_search_fallback, crawl_exit_code, main, process_crawl_sources


def row(url: str) -> tuple[int, str, str, str, str, bool]:
    return (1, 'tool', 'Tool', 'changelog', url, True)


class CrawlBatchTests(unittest.TestCase):
    def run_batch(self, rows, failing_urls=()):
        seen = []
        failing_urls = set(failing_urls)

        def process(source):
            seen.append(source[4])
            if source[4] in failing_urls:
                raise RuntimeError('synthetic crawl failure')

        with contextlib.redirect_stdout(io.StringIO()):
            result = process_crawl_sources(rows, process)
        return result, seen

    def test_all_success_returns_zero(self):
        result, seen = self.run_batch([row('https://one.test'), row('https://two.test')])
        self.assertEqual(result, CrawlRunResult(due=2, success=2, failed=0))
        self.assertEqual(crawl_exit_code(result), 0)
        self.assertEqual(seen, ['https://one.test', 'https://two.test'])

    def test_partial_failure_returns_nonzero_and_continues(self):
        rows = [row('https://one.test'), row('https://two.test'), row('https://three.test')]
        result, seen = self.run_batch(rows, ['https://two.test'])
        self.assertEqual(result, CrawlRunResult(due=3, success=2, failed=1))
        self.assertEqual(crawl_exit_code(result), 1)
        self.assertEqual(seen, [source[4] for source in rows])

    def test_total_failure_returns_nonzero(self):
        rows = [row('https://one.test'), row('https://two.test')]
        result, seen = self.run_batch(rows, [source[4] for source in rows])
        self.assertEqual(result, CrawlRunResult(due=2, success=0, failed=2))
        self.assertEqual(crawl_exit_code(result), 1)
        self.assertEqual(seen, [source[4] for source in rows])

    def test_no_due_sources_returns_zero(self):
        result, seen = self.run_batch([])
        self.assertEqual(result, CrawlRunResult(due=0, success=0, failed=0))
        self.assertEqual(crawl_exit_code(result), 0)
        self.assertEqual(seen, [])

    def test_one_failure_does_not_prevent_remaining_sources(self):
        rows = [row('https://first.test'), row('https://failed.test'), row('https://last.test')]
        result, seen = self.run_batch(rows, ['https://failed.test'])
        self.assertEqual(result.failed, 1)
        self.assertEqual(seen[-1], 'https://last.test')


class WorkerCliTests(unittest.TestCase):
    @patch('worker.init_db')
    @patch('worker.seed_watchset')
    @patch('worker.crawl_once', return_value=CrawlRunResult(due=2, success=1, failed=1))
    def test_crawl_cli_returns_nonzero_after_failure(self, crawl_once, seed_watchset, init_db):
        with patch.object(sys, 'argv', ['worker.py', 'crawl']):
            self.assertEqual(main(), 1)
        init_db.assert_called_once_with()
        seed_watchset.assert_called_once_with()
        crawl_once.assert_called_once_with()

    @patch('worker.init_db')
    @patch('worker.discover_once', return_value=DiscoveryRunResult(3, 2, 1, 18))
    def test_discover_cli_returns_nonzero_when_directory_source_fails(self, discover_once, init_db):
        with patch.object(sys, 'argv', ['worker.py', 'discover']):
            self.assertEqual(main(), 1)
        init_db.assert_called_once_with()
        discover_once.assert_called_once_with()

    @patch('worker.search')
    def test_directory_search_fallback_extracts_candidate_links(self, search):
        search.return_value = [{
            'title': 'Alpha AI',
            'url': 'https://www.producthunt.com/products/alpha-ai',
        }]
        source = {
            'id': 'product-hunt',
            'name': 'Product Hunt',
            'url': 'https://www.producthunt.com/categories/ai-software',
            'candidatePathPrefixes': ['/products/'],
            'maxCandidates': 4,
            'weight': 3.0,
        }
        candidates = _directory_search_fallback(source)
        self.assertEqual(candidates[0]['title'], 'Alpha AI')
        self.assertEqual(candidates[0]['url'], 'https://www.producthunt.com/products/alpha-ai')
        search.assert_called_once_with('site:www.producthunt.com /products/')

    @patch('worker.init_db')
    @patch('worker.enrich_once', return_value={'scanned': 0, 'enriched': 0, 'partial': 0, 'failed': 0, 'sources': 0, 'changes': 0})
    def test_empty_enrich_queue_returns_zero(self, enrich_once, init_db):
        with patch.object(sys, 'argv', ['worker.py', 'enrich', '--limit', '5']):
            self.assertEqual(main(), 0)
        init_db.assert_called_once_with()
        enrich_once.assert_called_once_with(limit=5, days=30)


if __name__ == '__main__':
    unittest.main()