-- 067_entitlements_and_payments.sql
--
-- P3 payments: one-time PHP 500 "Iskotify Full Access", bought on Android through
-- Google Play (RevenueCat) or on the web through PayMongo Checkout. Either one
-- unlocks both platforms.
--
-- public.entitlements: the source of truth for "does this user have Full Access".
--   One row per user. Clients may only READ their own row; every write comes from
--   the admin API's service-role client (the PayMongo and RevenueCat webhooks, or
--   staff). profiles gets NO premium column (066 limits client UPDATE on profiles;
--   this table keeps the flag out of client reach entirely).
--   source: 'play' (Google Play via RevenueCat), 'web' (PayMongo), 'grandfather'
--   (early supporters), 'admin' (granted by staff). A Play refund or expiry only
--   ever revokes a 'play' grant; the server never revokes the other sources.
--
-- public.payment_events: every verified webhook event, keyed by the provider's
--   event id. The primary key is the idempotency guard (a replayed event conflicts
--   and is skipped), and the rows are the purchase records. No client access at
--   all. user_id has NO foreign key: purchase records are kept for tax after an
--   account is deleted, and delete_user_data sets user_id to NULL.
--
-- delete_user_data (064) is replaced with the same definition plus:
--   'entitlements:user_id' in the delete list (before profiles), and
--   'payment_events:user_id' in the null-out list.
--
-- ── MANUAL VERIFICATION (a throwaway user, never a real student) ───────────────
--   1. As service_role:
--        insert into public.entitlements (user_id, premium, source, granted_at)
--          values ('<X>', true, 'admin', now());
--        insert into public.payment_events (id, provider, user_id, type, payload)
--          values ('evt_manual_test', 'paymongo', '<X>', 'manual', '{}');
--   2. Signed in as X (authenticated REST):
--        select * from entitlements;                 -- exactly X's row
--        update entitlements set premium = false;    -- 0 rows / permission denied
--        insert into entitlements (user_id, premium, source) values ('<X>', true, 'web');
--                                                    -- permission denied
--        select * from payment_events;               -- permission denied
--   3. Signed in as another user Y: select * from entitlements;  -- no rows
--   4. Replay guard: inserting 'evt_manual_test' again fails with 23505.
--   5. Delete X's account in the app (Profile -> Your data -> Delete account):
--        select count(*) from public.entitlements where user_id = '<X>';  -- 0
--        select user_id from public.payment_events where id = 'evt_manual_test';
--                                                    -- NULL (row kept)
--   6. Clean up: delete from public.payment_events where id = 'evt_manual_test';

CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  premium    boolean NOT NULL DEFAULT false,
  source     text NOT NULL CHECK (source IN ('play', 'web', 'grandfather', 'admin')),
  granted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlements_select_own ON public.entitlements;
CREATE POLICY entitlements_select_own ON public.entitlements FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.entitlements FROM anon, authenticated;
GRANT SELECT ON public.entitlements TO authenticated;

CREATE TABLE IF NOT EXISTS public.payment_events (
  id              text PRIMARY KEY,
  provider        text NOT NULL CHECK (provider IN ('paymongo', 'revenuecat')),
  user_id         uuid,
  type            text NOT NULL,
  amount_centavos int,
  payload         jsonb NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);

-- delete_user_data nulls user_id by value; keep that from scanning the table.
CREATE INDEX IF NOT EXISTS payment_events_user_id_idx ON public.payment_events (user_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_events FROM anon, authenticated;

-- 064's function, with entitlements deleted and payment_events unlinked.
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
