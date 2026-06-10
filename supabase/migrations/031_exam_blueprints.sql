-- Exam Blueprints: data-driven, admin-controlled exam mechanics.
-- Four reference tables (categories, blueprints, sections, course notes) + a
-- skill_category tag on the existing question bank. Public read, admin write.

CREATE TABLE IF NOT EXISTS exam_skill_categories (
  name text PRIMARY KEY,
  requires_spatial_logic boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_blueprints (
  slug text PRIMARY KEY,
  name text NOT NULL,
  acronym text NOT NULL DEFAULT '',
  total_items int NOT NULL DEFAULT 0,
  total_time_minutes int NOT NULL DEFAULT 0,
  has_guessing_penalty boolean NOT NULL DEFAULT false,
  guessing_penalty numeric NOT NULL DEFAULT 0.25,
  section_blocked boolean NOT NULL DEFAULT false,
  scoring_note text NOT NULL DEFAULT '',
  mechanics_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_blueprint_sections (
  id text PRIMARY KEY,
  blueprint_slug text NOT NULL REFERENCES exam_blueprints(slug) ON DELETE CASCADE,
  name text NOT NULL,
  skill_category text NOT NULL DEFAULT '',
  item_count int NOT NULL DEFAULT 0,
  time_minutes int,
  requires_spatial_logic boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_blueprint_sections_slug_idx ON exam_blueprint_sections (blueprint_slug);

CREATE TABLE IF NOT EXISTS exam_course_notes (
  id text PRIMARY KEY,
  blueprint_slug text NOT NULL REFERENCES exam_blueprints(slug) ON DELETE CASCADE,
  course_cluster text NOT NULL DEFAULT 'all',
  note text NOT NULL DEFAULT '',
  min_percentile int,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_course_notes_slug_idx ON exam_course_notes (blueprint_slug);

-- Tie questions to the shared taxonomy; backfill the existing 4 UPCAT subtests.
ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS skill_category text;
UPDATE upcat_questions SET skill_category = CASE subtest
  WHEN 'Mathematics' THEN 'Mathematics'
  WHEN 'Science' THEN 'Science'
  WHEN 'Language Proficiency' THEN 'English/Language'
  WHEN 'Reading Comprehension' THEN 'Reading Comprehension'
  ELSE skill_category END
WHERE skill_category IS NULL;

DROP TRIGGER IF EXISTS exam_blueprints_updated_at ON exam_blueprints;
CREATE TRIGGER exam_blueprints_updated_at BEFORE UPDATE ON exam_blueprints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_blueprint_sections_updated_at ON exam_blueprint_sections;
CREATE TRIGGER exam_blueprint_sections_updated_at BEFORE UPDATE ON exam_blueprint_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_course_notes_updated_at ON exam_course_notes;
CREATE TRIGGER exam_course_notes_updated_at BEFORE UPDATE ON exam_course_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_skill_categories_updated_at ON exam_skill_categories;
CREATE TRIGGER exam_skill_categories_updated_at BEFORE UPDATE ON exam_skill_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE exam_skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprint_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_course_notes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_skill_categories','exam_blueprints','exam_blueprint_sections','exam_course_notes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON %I', t, t);
    EXECUTE format($f$CREATE POLICY %I_admin ON %I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))$f$, t, t);
  END LOOP;
END $$;
