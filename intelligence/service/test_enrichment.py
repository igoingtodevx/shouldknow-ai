import unittest
from datetime import datetime, timezone

from enrichment import (
    RecentEntry,
    backfill_key,
    canonical_tool_id,
    canonical_url,
    classify_source_result,
    extract_recent_entries,
    find_first_party_sources,
    find_first_party_sources_detailed,
    source_coverage,
)


class FirstPartySourceTests(unittest.TestCase):
    def test_canonical_url_rejects_ssrf_targets(self):
        self.assertIsNone(canonical_url('http://127.0.0.1:8080/claude'))
        self.assertIsNone(canonical_url('http://[::1]/claude'))
        self.assertIsNone(canonical_url('https://user:pass@claude.com/'))
        self.assertIsNone(canonical_url('https://claude.com:8443/'))
        self.assertIsNone(canonical_url('https://service.internal/'))
        self.assertIsNone(canonical_url('https://internal/'))
        self.assertIsNone(canonical_url('http://2130706433/'))
        self.assertIsNone(canonical_url('http://127.1/'))
        self.assertIsNone(canonical_url('http://[::1'))

    def test_classifies_official_source_kinds_and_rejects_aggregator(self):
        common = {'candidate_title': 'Claude', 'seed_url': 'https://www.futurepedia.io/tool/claude'}
        homepage = classify_source_result(
            {'title': 'Claude official website', 'url': 'https://claude.com/'},
            **common, requested_kind='homepage', trusted_hosts=set(),
        )
        pricing = classify_source_result(
            {'title': 'Claude pricing and plans', 'url': 'https://claude.com/pricing'},
            **common, requested_kind='pricing', trusted_hosts={'claude.com'},
        )
        aggregator = classify_source_result(
            {'title': 'Claude pricing review', 'url': 'https://futurepedia.io/tool/claude'},
            **common, requested_kind='pricing', trusted_hosts={'claude.com'},
        )
        self.assertIsNotNone(homepage)
        self.assertIsNotNone(pricing)
        assert homepage is not None
        assert pricing is not None
        self.assertEqual(homepage.kind, 'homepage')
        self.assertEqual(pricing.kind, 'pricing')
        self.assertIsNone(aggregator)

    def test_homepage_requires_registrable_official_identity(self):
        self.assertIsNone(classify_source_result(
            {'title': 'Claude official website', 'url': 'https://claude.evil.example/claude'},
            candidate_title='Claude', seed_url='https://futurepedia.io/tool/claude',
            requested_kind='homepage', trusted_hosts=set(),
        ))
        self.assertIsNone(classify_source_result(
            {'title': 'Claude official website', 'url': 'https://gist.github.com/user/claude'},
            candidate_title='Claude', seed_url='https://futurepedia.io/tool/claude',
            requested_kind='homepage', trusted_hosts=set(),
        ))
        self.assertIsNone(classify_source_result(
            {'title': 'ChatGPT by OpenAI official website', 'url': 'https://openai.com/'},
            candidate_title='ChatGPT', seed_url='https://futurepedia.io/tool/chatgpt',
            requested_kind='homepage', trusted_hosts=set(),
        ))

    def test_rejects_unrelated_github_aggregator(self):
        match = classify_source_result(
            {'title': 'GitHub - claude alternatives list', 'url': 'https://github.com/awesome/claude-alternatives'},
            candidate_title='Claude', seed_url='https://example.test/claude',
            requested_kind='github', trusted_hosts=set(), trusted_github_owners=set(),
        )
        self.assertIsNone(match)

    def test_rejects_non_first_party_support_domain(self):
        match = classify_source_result(
            {'title': 'Claude changelog', 'url': 'https://example-news.test/claude/changelog'},
            candidate_title='Claude', seed_url='https://futurepedia.io/tool/claude',
            requested_kind='changelog', trusted_hosts={'claude.com'},
        )
        self.assertIsNone(match)

    def test_accepts_known_official_github_owner_only(self):
        match = classify_source_result(
            {'title': 'GitHub - anthropics/claude-code releases', 'url': 'https://github.com/anthropics/claude-code/releases'},
            candidate_title='Claude', seed_url='https://futurepedia.io/tool/claude',
            requested_kind='github', trusted_hosts=set(), trusted_github_owners={'anthropics'},
        )
        self.assertIsNotNone(match)

    def test_rejects_alternative_repository_even_for_known_owner(self):
        match = classify_source_result(
            {'title': 'Anthropic Claude alternatives', 'url': 'https://github.com/anthropics/claude-alternatives'},
            candidate_title='Claude', seed_url='https://futurepedia.io/tool/claude',
            requested_kind='github', trusted_hosts=set(), trusted_github_owners={'anthropics'},
        )
        self.assertIsNone(match)

    def test_reports_search_failures_separately(self):
        def failing_search(_query):
            raise RuntimeError('search unavailable')

        matches, failures = find_first_party_sources_detailed(
            'Claude', 'https://futurepedia.io/tool/claude', failing_search,
        )
        self.assertEqual(matches, {})
        self.assertEqual(failures, 5)

    def test_finds_one_match_per_kind_with_injected_search(self):
        responses = {
            '"Claude" official website': [{'title': 'Claude', 'url': 'https://claude.com/'}],
            '"Claude" official pricing plans': [{'title': 'Claude pricing', 'url': 'https://claude.com/pricing'}],
            '"Claude" official changelog release notes': [{'title': 'Claude updates', 'url': 'https://claude.com/news'}],
            '"Claude" official documentation docs API': [{'title': 'Claude API docs', 'url': 'https://docs.anthropic.com/claude/docs'}],
            '"Claude" official GitHub repository releases': [{'title': 'GitHub - anthropics/claude-code', 'url': 'https://github.com/anthropics/claude-code'}],
        }
        matches = find_first_party_sources('Claude', 'https://futurepedia.io/tool/claude', responses.__getitem__)
        self.assertEqual(set(matches), {'homepage', 'pricing', 'changelog', 'docs', 'github'})
        self.assertTrue(source_coverage(matches)[0])


class BackfillParsingTests(unittest.TestCase):
    def test_extracts_only_recent_dated_sections(self):
        now = datetime(2026, 9, 12, tzinfo=timezone.utc)
        markdown = '''
# Release 1.4.0 - September 10, 2026
New model and API support landed in this release.

# Release 1.3.0 - July 1, 2026
Old release that must not be backfilled.

# Undated section
No date here.
'''
        entries = extract_recent_entries(markdown, now=now, days=30)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].title, 'Release 1.4.0 - September 10, 2026')
        self.assertEqual(entries[0].published_at.date().isoformat(), '2026-09-10')

    def test_backfill_key_is_stable(self):
        entry = RecentEntry(
            title='Release 1.4.0',
            body='API support',
            published_at=datetime(2026, 9, 10, tzinfo=timezone.utc),
        )
        self.assertEqual(backfill_key(12, entry), backfill_key(12, entry))
        self.assertNotEqual(backfill_key(12, entry), backfill_key(13, entry))
        edited = RecentEntry(entry.title, 'API support with a clarification', entry.published_at)
        self.assertEqual(backfill_key(12, entry), backfill_key(12, edited))

    def test_parses_iso_timestamp_and_september_abbreviation(self):
        now = datetime(2026, 9, 12, tzinfo=timezone.utc)
        markdown = '''
# ISO release
Published 2026-09-10T12:30:00Z. API support is available.

# September release
Published Sept 9, 2026. Model update is available.
'''
        entries = extract_recent_entries(markdown, now=now, days=30)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0].published_at.date().isoformat(), '2026-09-10')

    def test_rejects_future_dated_sections(self):
        now = datetime(2026, 9, 12, tzinfo=timezone.utc)
        markdown = '# Future release - September 13, 2026\nNot released yet and must be ignored.'
        self.assertEqual(extract_recent_entries(markdown, now=now, days=30), [])

    def test_backfill_window_is_fixed(self):
        with self.assertRaises(ValueError):
            extract_recent_entries('# Release - September 10, 2026\nA valid release body.', now=datetime(2026, 9, 12, tzinfo=timezone.utc), days=31)

    def test_canonical_tool_id_is_safe_and_bounded(self):
        self.assertEqual(canonical_tool_id('Google Gemini', 'https://gemini.google.com/'), 'google-gemini')
        self.assertLessEqual(len(canonical_tool_id('x' * 200)), 80)


if __name__ == '__main__':
    unittest.main()
