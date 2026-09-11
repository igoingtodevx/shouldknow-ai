CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  category TEXT,
  editorial_verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  first_party BOOLEAN NOT NULL DEFAULT true,
  crawl_every_minutes INTEGER NOT NULL DEFAULT 360,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_crawled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  http_status INTEGER,
  UNIQUE(source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS changes (
  id BIGSERIAL PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  before_snapshot_id BIGINT REFERENCES snapshots(id),
  after_snapshot_id BIGINT NOT NULL REFERENCES snapshots(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'capability',
  impact TEXT NOT NULL DEFAULT 'medium',
  materiality TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  publication_status TEXT NOT NULL DEFAULT 'review',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT,
  published_at TIMESTAMPTZ
);

-- Existing shadow databases are upgraded in place when init_db() re-runs.
ALTER TABLE changes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE changes ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE changes ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE changes ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  source_name TEXT,
  source_url TEXT,
  source_kind TEXT NOT NULL DEFAULT 'search',
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(url)
);

ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'search';
ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS seen_count INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_changes_detected_at ON changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_tool_id ON changes(tool_id);
CREATE INDEX IF NOT EXISTS idx_changes_publication_status ON changes(publication_status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_source_time ON snapshots(source_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_kind_seen ON discovery_candidates(source_kind, last_seen_at DESC);
