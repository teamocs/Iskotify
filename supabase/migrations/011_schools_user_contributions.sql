-- 011_schools_user_contributions.sql
-- Allow organic growth of the schools directory from user contributions:
-- manual entries during onboarding + Google Places API selections.
-- DepEd-sourced rows remain untouched (source = 'deped' default).

ALTER TABLE schools ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'deped';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS schools_source_idx ON schools(source);

-- Public can insert ONLY user-contributed rows ('manual' or 'places').
-- The CHECK constraint blocks anyone from masquerading as DepEd data.
-- The existing (name, city) unique constraint prevents duplicate spam.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schools' AND policyname='schools_public_insert') THEN
    CREATE POLICY "schools_public_insert" ON schools
      FOR INSERT TO anon, authenticated
      WITH CHECK (source IN ('manual', 'places'));
  END IF;
END $$;
