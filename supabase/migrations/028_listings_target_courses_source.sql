-- Connect courses to listings (exams + scholarships) at the course-FIELD level.
-- listings.target_courses (text[]) holds career_courses.cluster values, or ['all'] for
-- open-to-any-course. A student's target course maps to a listing via that course's
-- cluster. This migration just adds a provenance column; the cluster values are
-- populated/maintained as data (AI-classified, then admin-editable).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS target_courses_source text;
COMMENT ON COLUMN listings.target_courses IS 'Course-field eligibility: array of career_courses.cluster values, or ["all"] for open-to-any-course. Joins to a student''s target course via that course''s cluster.';
COMMENT ON COLUMN listings.target_courses_source IS 'How target_courses was set: seed (curated), ai (auto-classified), manual (admin-edited).';