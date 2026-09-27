-- Sync flows get a Preview → Publish → History shape, and the two syncs are
-- separated: Drive question files (kb_*) and Google Sheets listings imports
-- (listing_import_*). All tables are service-role only (RLS on, no policies),
-- like kb_drive_files: the admin console reads and writes them server-side.

-- ── Drive question files ────────────────────────────────────────────────────

-- How a file's columns and pool were decided: a file-name rule, an AI mapping
-- (Gemini, validated before use) or an admin's manual mapping.
alter table public.kb_drive_files
  add column if not exists mapping_source text
    check (mapping_source in ('rule', 'ai', 'admin')),
  add column if not exists headers text[] not null default '{}',
  add column if not exists sample_rows jsonb not null default '[]'::jsonb,
  add column if not exists rows_rejected integer not null default 0,
  add column if not exists rejected_rows jsonb not null default '[]'::jsonb,
  -- Fingerprint of the folder's images at import time: when figures are added
  -- later, a file with missing figures is re-imported to attach them.
  add column if not exists figures_fingerprint text;

comment on column public.kb_drive_files.status is
  'imported | needs_mapping (no usable column/pool mapping, or a name collision) | skipped (unsupported type, excluded audience, too large) | error';

-- Mapping overrides, one per Drive file. Checked before the file-name rules.
-- columns: canonical field → source header, e.g. {"question":"Item","option_a":"Choice 1",…}.
create table if not exists public.kb_file_mappings (
  drive_file_id   text primary key references public.kb_drive_files (drive_file_id) on delete cascade,
  subtest         text not null,
  main_subject    text not null,
  skill_category  text not null default '',
  columns         jsonb not null,
  source          text not null check (source in ('ai', 'admin')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.kb_file_mappings enable row level security;

-- One row per sync run (cron or "Sync now"), including runs that failed before
-- any file was touched.
create table if not exists public.kb_sync_runs (
  id             bigint generated always as identity primary key,
  trigger        text not null check (trigger in ('cron', 'manual')),
  status         text not null check (status in ('running', 'ok', 'warn', 'error')),
  imported       integer not null default 0,
  unchanged      integer not null default 0,
  needs_mapping  integer not null default 0,
  skipped        integer not null default 0,
  errors         integer not null default 0,
  remaining      integer not null default 0,
  ai_mapped      integer not null default 0,
  message        text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
alter table public.kb_sync_runs enable row level security;
create index if not exists kb_sync_runs_started_idx on public.kb_sync_runs (started_at desc);

-- One row per Publish click: what went live and what was held back.
create table if not exists public.kb_publish_events (
  id                  bigint generated always as identity primary key,
  drive_file_id       text not null references public.kb_drive_files (drive_file_id) on delete cascade,
  file_name           text not null,
  published           integer not null default 0,
  already_published   integer not null default 0,
  held_missing_media  integer not null default 0,
  held_few_options    integer not null default 0,
  held_duplicate      integer not null default 0,
  published_by        uuid,
  created_at          timestamptz not null default now()
);
alter table public.kb_publish_events enable row level security;
create index if not exists kb_publish_events_file_idx on public.kb_publish_events (drive_file_id);
create index if not exists kb_publish_events_created_idx on public.kb_publish_events (created_at desc);

-- ── Listings from a Google Sheets link ──────────────────────────────────────

-- A pasted sheet is read into a batch in `preview`; Publish writes it to
-- listings and moves it to history; Discard drops it. rows holds the per-row
-- plan: [{slug, title, action: new|update|unchanged, changes: [field…], listing}].
create table if not exists public.listing_import_batches (
  id               uuid primary key default gen_random_uuid(),
  sheet_id         text not null,
  sheet_url        text not null,
  sheet_title      text,
  tab              text,
  status           text not null default 'preview' check (status in ('preview', 'published', 'discarded')),
  rows             jsonb not null default '[]'::jsonb,
  invalid          jsonb not null default '[]'::jsonb,
  missing          jsonb not null default '[]'::jsonb,
  column_map       jsonb,
  mapped_by_ai     boolean not null default false,
  new_count        integer not null default 0,
  update_count     integer not null default 0,
  unchanged_count  integer not null default 0,
  invalid_count    integer not null default 0,
  closed_count     integer not null default 0,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  published_by     uuid,
  published_at     timestamptz,
  discarded_at     timestamptz
);
alter table public.listing_import_batches enable row level security;
create index if not exists listing_import_batches_status_idx on public.listing_import_batches (status, created_at desc);
