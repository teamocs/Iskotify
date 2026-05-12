-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- LISTINGS
-- ============================================================
CREATE TABLE listings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type               text        NOT NULL CHECK (type IN ('scholarship', 'exam')),
  title              text        NOT NULL,
  slug               text        UNIQUE NOT NULL,
  provider           text        NOT NULL DEFAULT '',
  description        text        NOT NULL DEFAULT '',
  requirements       text[]      NOT NULL DEFAULT '{}',
  coverage           text        NOT NULL DEFAULT '',
  deadline           date,
  exam_date          date,
  results_date       date,
  events             jsonb       NOT NULL DEFAULT '[]',
  target_courses     text[]      NOT NULL DEFAULT '{}',
  target_year_levels text[]      NOT NULL DEFAULT '{}',
  tags               text[]      NOT NULL DEFAULT '{}',
  status             text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'upcoming')),
  region             text        NOT NULL DEFAULT '',
  grant_amount       numeric,
  external_url       text        NOT NULL DEFAULT '',
  image_url          text        NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text        NOT NULL DEFAULT '',
  avatar_url      text        NOT NULL DEFAULT '',
  year_level      text        NOT NULL DEFAULT '',
  target_courses  text[]      NOT NULL DEFAULT '{}',
  region          text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USER_SAVED_LISTINGS
-- ============================================================
CREATE TABLE user_saved_listings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id  uuid        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

-- ============================================================
-- FLASHCARD_SUBJECTS
-- ============================================================
CREATE TABLE flashcard_subjects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        UNIQUE NOT NULL,
  icon_url    text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FLASHCARD_TOPICS
-- ============================================================
CREATE TABLE flashcard_topics (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  uuid        NOT NULL REFERENCES flashcard_subjects(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FLASHCARDS
-- ============================================================
CREATE TABLE flashcards (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid        NOT NULL REFERENCES flashcard_topics(id) ON DELETE CASCADE,
  question        text        NOT NULL,
  answer          text        NOT NULL,
  explanation     text        NOT NULL DEFAULT '',
  difficulty      int         NOT NULL DEFAULT 1 CHECK (difficulty IN (1, 2, 3)),
  source_pdf_url  text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRACTICE_SESSIONS
-- ============================================================
CREATE TABLE practice_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id      uuid        NOT NULL REFERENCES flashcard_topics(id),
  title         text        NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  total_cards   int         NOT NULL DEFAULT 0,
  correct_count int         NOT NULL DEFAULT 0
);

-- ============================================================
-- USER_FLASHCARD_PROGRESS
-- ============================================================
CREATE TABLE user_flashcard_progress (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flashcard_id    uuid        NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  times_seen      int         NOT NULL DEFAULT 0,
  times_correct   int         NOT NULL DEFAULT 0,
  readiness_score float,
  last_seen_at    timestamptz,
  UNIQUE(user_id, flashcard_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON listings(status);
CREATE INDEX ON listings(type);
CREATE INDEX ON listings(deadline);
CREATE INDEX ON listings(region);
CREATE INDEX ON listings USING GIN(tags);
CREATE INDEX ON listings USING GIN(target_courses);
CREATE INDEX ON user_saved_listings(user_id);
CREATE INDEX ON user_flashcard_progress(user_id);
CREATE INDEX ON practice_sessions(user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcard_progress ENABLE ROW LEVEL SECURITY;

-- listings: public SELECT, no public write
CREATE POLICY "listings_public_read"
  ON listings FOR SELECT USING (true);

-- profiles: owner only
CREATE POLICY "profiles_owner_select"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_owner_update"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_saved_listings: owner only
CREATE POLICY "saved_owner_select"
  ON user_saved_listings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_owner_insert"
  ON user_saved_listings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_owner_delete"
  ON user_saved_listings FOR DELETE USING (auth.uid() = user_id);

-- flashcard tables: public SELECT
CREATE POLICY "subjects_public_read"
  ON flashcard_subjects FOR SELECT USING (true);
CREATE POLICY "topics_public_read"
  ON flashcard_topics FOR SELECT USING (true);
CREATE POLICY "flashcards_public_read"
  ON flashcards FOR SELECT USING (true);

-- practice_sessions: owner only
CREATE POLICY "sessions_owner_select"
  ON practice_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_owner_insert"
  ON practice_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_owner_update"
  ON practice_sessions FOR UPDATE USING (auth.uid() = user_id);

-- user_flashcard_progress: owner only
CREATE POLICY "progress_owner_select"
  ON user_flashcard_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "progress_owner_insert"
  ON user_flashcard_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "progress_owner_update"
  ON user_flashcard_progress FOR UPDATE USING (auth.uid() = user_id);
