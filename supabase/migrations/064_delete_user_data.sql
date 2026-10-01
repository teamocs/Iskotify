-- 064_delete_user_data.sql
--
-- Account deletion, database half. The in-app "Delete account" button calls the
-- admin API route POST /api/account/delete, which (1) verifies the caller's
-- access token, (2) removes the user's screenshot files through the Storage API,
-- (3) calls THIS function, (4) deletes the login with the Auth Admin API. This
-- function only removes the user's rows in public tables.
--
-- Why not one SQL function the app calls directly (the first draft):
--   • storage.objects has a delete-protect trigger (storage.protect_delete) that
--     refuses SQL deletes, and a SQL delete would orphan the file bytes anyway;
--     only the Storage API removes the bytes.
--   • auth.users is best deleted through the Auth Admin API.
--
-- Security model
--   • SECURITY DEFINER, empty search_path: every object is schema-qualified.
--   • Takes the user id as an ARGUMENT, so it must never be callable by a client:
--     EXECUTE is revoked from public, anon and authenticated and granted to
--     service_role ONLY (the admin route's server-side client). The route proves
--     who the caller is (auth.getUser(token)) before passing the id.
--   • p_uid NULL raises (fails closed). Idempotent: running it twice finds nothing
--     the second time. One transaction: any error rolls the whole call back.
--   • Every table is guarded with to_regclass(), so a table that does not exist in
--     an environment (e.g. google_calendar_connections is not in prod) is skipped
--     instead of failing the call.
--
-- Per-table decisions
--   DELETED (the user's own data or personal content), 'table:column':
--     app_bug_reports, app_feedback, question_reports, listing_date_contributions
--       (free text / suggestions the student wrote; approved dates already live on
--       listings), user_app_data (the cloud backup), google_calendar_connections
--       (stored refresh token), user_saved_listings, practice_sessions,
--       user_flashcard_progress, then profiles last (the others reference it).
--     early_access_registrations: by the account email (the table has no user id).
--   KEPT, reference set to NULL (staff/audit records holding no student content):
--     question_flag_dismissals.dismissed_by, kb_publish_events.published_by,
--     listing_import_batches.created_by / published_by,
--     listing_date_contributions.reviewed_by (on OTHER users' rows).
--   Nothing is retained for a legal obligation today.
--
-- ── MANUAL VERIFICATION (a throwaway user, never a real student) ───────────────
--   1. Create user X (Auth -> Users). Sign in as X in the app: practise, file a bug
--      report with a screenshot, send feedback, report a question.
--   2. Note X's id and email. Confirm rows exist:
--        select count(*) from public.user_app_data   where user_id = '<X>';
--        select count(*) from public.app_bug_reports where user_id = '<X>';
--   3. In the app: Profile -> Your data -> Delete account -> type DELETE -> confirm.
--   4. All counts above are now 0, and:
--        select count(*) from auth.users where id = '<X>';                       -- 0
--        select count(*) from public.profiles where id = '<X>';                  -- 0
--        select count(*) from public.early_access_registrations
--          where lower(email) = lower('<X email>');                              -- 0
--      The screenshot is gone from Storage -> app-bug-reports.
--   5. Not callable by clients: as an authenticated or anon REST call,
--        select public.delete_user_data('<any uuid>');   -- permission denied
--      and  select public.delete_user_data(null);  as service_role raises.
--   6. Idempotent: run  select public.delete_user_data('<X>');  as service_role
--      again: no error, no change.
--   7. Staff rows survive: question_flag_dismissals / kb_publish_events /
--      listing_import_batches rows X created exist with a NULL user column.

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
  FOREACH v_pair IN ARRAY ARRAY[
    'question_flag_dismissals:dismissed_by',
    'kb_publish_events:published_by',
    'listing_import_batches:created_by',
    'listing_import_batches:published_by',
    'listing_date_contributions:reviewed_by'
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
