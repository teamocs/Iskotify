CREATE TABLE IF NOT EXISTS upcat_facts (
  id text PRIMARY KEY,
  topic text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  source text,
  valid_year int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upcat_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_facts_read ON upcat_facts;
CREATE POLICY upcat_facts_read ON upcat_facts FOR SELECT USING (true);

DROP TRIGGER IF EXISTS upcat_facts_updated_at ON upcat_facts;
CREATE TRIGGER upcat_facts_updated_at
  BEFORE UPDATE ON upcat_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
