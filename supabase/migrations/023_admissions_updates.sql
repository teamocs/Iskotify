CREATE TABLE IF NOT EXISTS admissions_updates (
  id text PRIMARY KEY, report_date date NOT NULL, severity text NOT NULL,
  school_slug text, school_name text, title text NOT NULL, body text NOT NULL,
  action_required text, event_date date, event_type text,
  sources jsonb NOT NULL DEFAULT '[]', verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_admissions_event ON admissions_updates(event_date);
CREATE INDEX IF NOT EXISTS idx_admissions_report ON admissions_updates(report_date);
ALTER TABLE admissions_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admissions_updates_read ON admissions_updates;
CREATE POLICY admissions_updates_read ON admissions_updates FOR SELECT USING (true);
DROP TRIGGER IF EXISTS admissions_updates_updated_at ON admissions_updates;
CREATE TRIGGER admissions_updates_updated_at BEFORE UPDATE ON admissions_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
