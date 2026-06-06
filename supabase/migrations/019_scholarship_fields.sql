-- Epic B: scholarship typed columns (matcher + facets) + profile location
ALTER TABLE listings ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'national';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS income_ceiling numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gwa_requirement numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS monthly_stipend numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS service_obligation_years int;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS has_entrance_exam boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS application_window text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS scholarship_meta jsonb NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_scope_check') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_scope_check
      CHECK (scope IN ('national','regional','provincial','city','school'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_scope ON listings(scope);
CREATE INDEX IF NOT EXISTS idx_listings_province ON listings(province);
CREATE INDEX IF NOT EXISTS idx_listings_is_verified ON listings(is_verified);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
