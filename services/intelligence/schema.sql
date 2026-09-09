create table if not exists products (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  url text not null unique,
  source_type text not null,
  first_party boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists snapshots (
  id bigserial primary key,
  source_id bigint not null references sources(id) on delete cascade,
  content_hash text not null,
  markdown text not null,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
create index if not exists snapshots_source_captured_idx on snapshots(source_id, captured_at desc);

create table if not exists change_candidates (
  id bigserial primary key,
  source_id bigint not null references sources(id) on delete cascade,
  before_snapshot_id bigint references snapshots(id) on delete set null,
  after_snapshot_id bigint not null references snapshots(id) on delete cascade,
  diff text not null,
  materiality_score integer not null check (materiality_score between 0 and 100),
  kind text not null,
  impact text not null check (impact in ('high','medium','low')),
  reasons jsonb not null default '[]'::jsonb,
  status text not null check (status in ('noise','review','ready','published','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists signals (
  id bigserial primary key,
  candidate_id bigint not null unique references change_candidates(id) on delete restrict,
  product_id bigint not null references products(id) on delete cascade,
  title text not null,
  summary text not null,
  why_it_matters text not null,
  action text,
  impact text not null check (impact in ('high','medium','low')),
  kind text not null,
  confidence double precision not null check (confidence between 0 and 1),
  published_at timestamptz not null default now()
);
create index if not exists signals_published_idx on signals(published_at desc);
create index if not exists signals_product_idx on signals(product_id, published_at desc);
