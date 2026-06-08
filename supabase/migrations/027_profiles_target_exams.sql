-- Server-side parity for the onboarding "Target University Exams" picks.
-- profiles.target_courses already exists (migration 001); add target_exams for
-- the new onboarding step. Mobile primarily stores these in user_app_data.settings,
-- but writes profiles.target_courses/target_exams as best-effort when signed in.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_exams text[] NOT NULL DEFAULT '{}';
