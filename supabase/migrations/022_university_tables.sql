CREATE TABLE IF NOT EXISTS tertiary_schools (
  id text PRIMARY KEY, name text NOT NULL, acronym text, region text, province text, city text,
  type text, is_suc boolean NOT NULL DEFAULT false, is_luc boolean NOT NULL DEFAULT false,
  deped_school_id int, rank_in_province int, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_tertiary_region ON tertiary_schools(region);
CREATE INDEX IF NOT EXISTS idx_tertiary_type ON tertiary_schools(type);
CREATE TABLE IF NOT EXISTS university_profiles (
  school_id text PRIMARY KEY REFERENCES tertiary_schools(id), data_tier text, institution_type text,
  year_established text, known_for_courses text[] NOT NULL DEFAULT '{}', prc_top_courses text[] NOT NULL DEFAULT '{}',
  ched_coe_cod text, accreditation text, entrance_exam_name text, entrance_exam_acronym text,
  testing_center_type text, application_open text, application_close text, exam_month text,
  estimated_passing_rate text, estimated_slots text, tuition_fee_range text, free_tuition boolean,
  academic_calendar text, courses_offered text[] NOT NULL DEFAULT '{}', scholarships_offered text[] NOT NULL DEFAULT '{}',
  website_url text, application_portal_url text, facebook_url text, exam_difficulty int,
  notable_programs text[] NOT NULL DEFAULT '{}', prc_strong_boards text[] NOT NULL DEFAULT '{}',
  notes text, data_confidence text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_school_rankings (
  id text PRIMARY KEY, course_tab text NOT NULL, course_name text, rank int, school_name text NOT NULL,
  region text, province text, wilson_score numeric, raw_pass_rate numeric, total_examinees int,
  total_passers int, years_with_data text, exam_periods int, tertiary_school_id text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_rankings_tab ON course_school_rankings(course_tab, rank);
CREATE TABLE IF NOT EXISTS course_school_quality (
  id text PRIMARY KEY, school_name text NOT NULL, region text, province text, city text,
  course_standardized text, course_group text, school_type text, ched_coe_cod text, quality_score int,
  quality_tier text, accreditations text[] NOT NULL DEFAULT '{}', has_prc_board boolean,
  qs_subject_rank text, data_confidence text, tertiary_school_id text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_quality_group ON course_school_quality(course_group);
CREATE TABLE IF NOT EXISTS bar_results (
  id text PRIMARY KEY, school_name text NOT NULL, region text, province text, year int,
  pass_rate numeric, national_avg numeric, sc_rank int, notes text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_taxonomy_map (
  course_tab text PRIMARY KEY, career_course_id text, label text, kind text, updated_at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tertiary_schools','university_profiles','course_school_rankings','course_school_quality','bar_results','course_taxonomy_map'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_read', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t||'_updated_at', t);
  END LOOP; END $$;
