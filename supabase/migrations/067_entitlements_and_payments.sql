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
--   Writes go through grant_entitlement / revoke_play_entitlement below, each a
--   single atomic statement, so two concurrent webhooks cannot interleave a
--   read-then-write (e.g. a Play refund racing a web purchase).
--
-- public.payment_events: every verified webhook event, keyed by the provider's
--   event id. The primary key is the idempotency guard (a replayed event conflicts
--   and is skipped), and the rows are the purchase records. No client access at
--   all. user_id has NO foreign key: purchase records are kept for tax after an
--   account is deleted, and delete_user_data sets user_id to NULL. payload is a
--   MINIMAL record built by the admin routes (event id, type, transaction/session
--   id, amount, currency, mode/environment, store, product): never the provider's
--   full body, so no name, email, phone, alias, metadata or user id is kept and
--   nulling user_id really unlinks the person.
--
-- RevenueCat setup: Project settings -> Restore behavior must be
--   "Keep with original App User ID". With "Transfer to new App User ID", a
--   restore on another account moves the Play purchase; the webhook handles that
--   TRANSFER event (revokes the senders' 'play' grants, grants the receivers
--   'play'), but keeping purchases with the original id avoids the churn and the
--   window between the two webhooks.
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
--   7. Grant/revoke rules, as service_role on a throwaway user Z:
--        select public.grant_entitlement('<Z>', 'play');      -- true, source play
--        select public.grant_entitlement('<Z>', 'play');      -- true, granted_at unchanged
--        select public.revoke_play_entitlement('<Z>');        -- true, premium false
--        select public.grant_entitlement('<Z>', 'web');       -- true, source web
--        select public.grant_entitlement('<Z>', 'play');      -- false (web kept)
--        select public.revoke_play_entitlement('<Z>');        -- false (web kept)
--      As authenticated: select public.grant_entitlement('<Z>', 'admin');
--                                                    -- permission denied

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

-- Grant Full Access atomically. Rules, enforced in one INSERT .. ON CONFLICT:
--   • a 'play' grant never overrides an active web/grandfather/admin grant;
--   • any other grant (including web over play) takes over the source;
--   • re-granting an active grant keeps its original granted_at (replays);
--   • revoked_at is cleared.
-- Returns true when the row was written, false when the rules left it alone.
-- Plain (SECURITY INVOKER) function: the service role already bypasses RLS and
-- holds the table privileges; clients cannot execute it.
CREATE OR REPLACE FUNCTION public.grant_entitlement(p_uid uuid, p_source text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required' USING ERRCODE = '22004';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('play', 'web', 'grandfather', 'admin') THEN
    RAISE EXCEPTION 'invalid source %', p_source USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.entitlements AS e (user_id, premium, source, granted_at, revoked_at, updated_at)
  VALUES (p_uid, true, p_source, now(), NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    premium    = true,
    source     = EXCLUDED.source,
    granted_at = CASE WHEN e.premium THEN COALESCE(e.granted_at, EXCLUDED.granted_at) ELSE EXCLUDED.granted_at END,
    revoked_at = NULL,
    updated_at = now()
  WHERE NOT (e.premium AND EXCLUDED.source = 'play' AND e.source <> 'play');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Revoke a Play grant (refund, expiry, transfer away) atomically. Never touches
-- a web/grandfather/admin grant. Returns true when a row changed.
CREATE OR REPLACE FUNCTION public.revoke_play_entitlement(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required' USING ERRCODE = '22004';
  END IF;

  UPDATE public.entitlements
     SET premium = false, revoked_at = now(), updated_at = now()
   WHERE user_id = p_uid AND premium AND source = 'play';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_entitlement(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_play_entitlement(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_play_entitlement(uuid) TO service_role;

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
