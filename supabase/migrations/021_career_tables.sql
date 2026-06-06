CREATE TABLE IF NOT EXISTS career_courses (
  course_id text PRIMARY KEY, name text NOT NULL, cluster text, career_tag text, demand text,
  board_exam boolean NOT NULL DEFAULT false, board_exam_name text, duration_years numeric,
  top_countries text[] NOT NULL DEFAULT '{}', summary text, student_tip text, ai_note text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_destinations (
  id text PRIMARY KEY, course_id text REFERENCES career_courses(course_id), country text NOT NULL,
  demand_rating text, salary_min numeric, salary_max numeric, salary_local text, salary_type text,
  visa_pathway text, pr_pathway text, credential text, licensing_exam text, language_required text,
  timeline_months int, program_name text, specializations text[] NOT NULL DEFAULT '{}',
  notes text, saturation_warning text, source text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_career_dest_course ON career_destinations(course_id);
CREATE INDEX IF NOT EXISTS idx_career_dest_country ON career_destinations(country);
CREATE TABLE IF NOT EXISTS career_countries (
  code text PRIMARY KEY, name text NOT NULL, region text, immigration_system text, why_demand text,
  language_required text, pr_pathway text, notes text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_programs (
  id text PRIMARY KEY, name text NOT NULL, country_region text, courses_covered text[] NOT NULL DEFAULT '{}',
  managing_body text, slots text, requirements text, immigration_outcome text, website text, notes text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_career_impact (
  course_id text PRIMARY KEY, course_name text NOT NULL, cluster text, board_exam boolean NOT NULL DEFAULT false,
  board_exam_name text, automation_risk_low int, automation_risk_high int, ai_safety_score int,
  ai_safety_label text, color_code text, what_ai_takes_over text[] NOT NULL DEFAULT '{}',
  what_stays_human text[] NOT NULL DEFAULT '{}', new_jobs_emerging text[] NOT NULL DEFAULT '{}',
  skills_to_develop text[] NOT NULL DEFAULT '{}', career_outlook_2030 text, key_stat text, key_source text,
  key_quote text, quote_by text, ph_advantage text, ph_notes text, kuya_baw_summary text, last_updated text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_facts (
  id text PRIMARY KEY, course_id text, query_type text, course_name text NOT NULL,
  quick_answer text NOT NULL, key_caveat text, point_to text, updated_at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['career_courses','career_destinations','career_countries','career_programs','ai_career_impact','career_facts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_read', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t||'_updated_at', t);
  END LOOP; END $$;
