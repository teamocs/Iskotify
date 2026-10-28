-- Migration 069: blog posts from Drive (iskotify.ph/blog).
--
-- Blog Docs in a Drive folder (drive_sources content_type 'blog') sync into
-- blog_import_batches as previews, one live preview per file, exactly like
-- announcements (068). Staff publish a preview from /admin/sync, which upserts
-- blog_posts by slug; the public /blog pages read blog_posts server-side with
-- the service role. Nothing goes live without that publish click.
--
-- Also: delete_user_data (067) now unlinks the staff columns
-- announcement_import_batches.published_by and blog_import_batches.published_by.
--
-- Manual test plan (Supabase SQL editor, as service_role):
--   1. select pg_get_constraintdef(oid) from pg_constraint
--        where conrelid = 'public.drive_sources'::regclass and contype = 'c';
--                                                -- lists 'blog'
--   2. insert into public.blog_import_batches (drive_file_id, file_name, post, action)
--        values ('f-test', 'a', '{}', 'new'), ('f-test', 'b', '{}', 'new');
--                                                -- fails 23505 (one live preview)
--   3. insert into public.blog_posts (slug, drive_file_id, title, body_md)
--        values ('Bad Slug', 'f-x', 't', 'b');   -- fails 23514 (slug check)
--   4. Clean up: delete from public.blog_import_batches where drive_file_id = 'f-test';

-- 1. 'blog' joins the Drive content types. The CHECKs were created unnamed in
--    068, so find them by definition rather than guess their names.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.drive_sources'::regclass, 'public.drive_content_files'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%content_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.drive_sources
  ADD CONSTRAINT drive_sources_content_type_check
  CHECK (content_type IN ('questions', 'listings', 'announcements', 'blog'));
ALTER TABLE public.drive_content_files
  ADD CONSTRAINT drive_content_files_content_type_check
  CHECK (content_type IN ('listings', 'announcements', 'blog'));

-- 2. Previews: one parsed post per Doc version.
CREATE TABLE IF NOT EXISTS public.blog_import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id  text NOT NULL,
  file_name      text NOT NULL,
  status         text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'published', 'discarded')),
  action         text NOT NULL CHECK (action IN ('new', 'update')),
  post           jsonb NOT NULL,
  flags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  published_by   uuid,
  published_at   timestamptz,
  discarded_at   timestamptz
);
ALTER TABLE public.blog_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_import_batches FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS blog_import_batches_status_idx
  ON public.blog_import_batches (status, created_at desc);
CREATE UNIQUE INDEX IF NOT EXISTS blog_import_batches_one_preview
  ON public.blog_import_batches (drive_file_id) WHERE status = 'preview';

-- 3. Live posts. Read only server-side (service role); never exposed to the app keys.
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  drive_file_id       text NOT NULL UNIQUE,
  title               text NOT NULL,
  meta_title          text,
  meta_description    text,
  body_md             text NOT NULL,
  faq                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_name         text,
  author_bio          text,
  status              text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'unpublished')),
  first_published_at  timestamptz NOT NULL DEFAULT now(),
  source_modified_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_posts FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON public.blog_posts (first_published_at desc) WHERE status = 'published';

DROP TRIGGER IF EXISTS blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. 067's delete_user_data, with the two staff publish columns unlinked too.
CREATE OR REPLACE FUNCTION public.delete_user_data(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_pair  text;
  v_tbl   text;
  v_col   text;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required' USING ERRCODE = '22004';
  END IF;

  -- Only a CONFIRMED email may match the early-access list: an unverified
  -- sign-up with someone else's address must not delete their registration.
  SELECT email INTO v_email FROM auth.users WHERE id = p_uid
    AND email_confirmed_at IS NOT NULL;

  -- The user's own rows. profiles is last: the earlier tables may reference it.
  FOREACH v_pair IN ARRAY ARRAY[
    'app_bug_reports:user_id',
    'app_feedback:user_id',
    'question_reports:user_id',
    'listing_date_contributions:user_id',
    'user_app_data:user_id',
    'google_calendar_connections:user_id',
    'user_saved_listings:user_id',
    'practice_sessions:user_id',
    'user_flashcard_progress:user_id',
    'entitlements:user_id',
    'profiles:id'
  ] LOOP
    v_tbl := split_part(v_pair, ':', 1);
    v_col := split_part(v_pair, ':', 2);
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', v_tbl, v_col) USING p_uid;
    END IF;
  END LOOP;

  -- Early-access sign-up (name, email, school): matched by the account email.
  IF v_email IS NOT NULL AND to_regclass('public.early_access_registrations') IS NOT NULL THEN
    DELETE FROM public.early_access_registrations WHERE lower(email) = lower(v_email);
  END IF;

  -- Staff/audit records: keep the row, drop the link to this person.
  -- payment_events: purchase records are kept for tax, unlinked from the person.
  FOREACH v_pair IN ARRAY ARRAY[
    'question_flag_dismissals:dismissed_by',
    'kb_publish_events:published_by',
    'listing_import_batches:created_by',
    'listing_import_batches:published_by',
    'listing_date_contributions:reviewed_by',
    'announcement_import_batches:published_by',
    'blog_import_batches:published_by',
    'payment_events:user_id'
  ] LOOP
    v_tbl := split_part(v_pair, ':', 1);
    v_col := split_part(v_pair, ':', 2);
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', v_tbl, v_col, v_col) USING p_uid;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid) TO service_role;
