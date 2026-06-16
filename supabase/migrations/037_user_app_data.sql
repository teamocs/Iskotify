-- 037_user_app_data.sql
--
-- Per-user cloud backup table for cross-device sync. The mobile app's
-- services/sync.ts pushUserData() upserts one row per user and pullUserData()
-- restores it on sign-in/launch. The table already EXISTS in prod (created
-- out-of-band with owner-scoped RLS); this migration codifies it in the repo,
-- is fully IDEMPOTENT, and ADDS the new user_requirements column (scholarship
-- requirement acquisition) so existing prod rows gain it without data loss.
--
-- Columns mirror exactly the keys sync.ts reads/writes on the upsert payload:
--   focus_listings, saved_decks, user_progress, practice_sessions, settings,
--   notes, note_labels, note_label_assignments, user_requirements, updated_at.
-- All payload arrays/objects are stored as jsonb (the client serializes whole
-- Drizzle rows). user_requirements is OPTIONAL on the client's pull path, so
-- older backups without it still restore fine.

-- ── Table (create if it doesn't already exist) ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_app_data (
  user_id                uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  focus_listings         jsonb,
  saved_decks            jsonb,
  user_progress          jsonb,
  practice_sessions      jsonb,
  settings               jsonb,
  notes                  jsonb,
  note_labels            jsonb,
  note_label_assignments jsonb,
  user_requirements      jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── New column for existing prod tables (no-op if already present) ─────────────
ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS user_requirements jsonb;

-- ── Row Level Security: each user manages only their own row ──────────────────
ALTER TABLE user_app_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can manage their own data" ON user_app_data;
CREATE POLICY "users can manage their own data" ON user_app_data
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
