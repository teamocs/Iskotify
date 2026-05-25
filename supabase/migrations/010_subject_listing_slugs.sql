-- supabase/migrations/010_subject_listing_slugs.sql
ALTER TABLE flashcard_subjects
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';
