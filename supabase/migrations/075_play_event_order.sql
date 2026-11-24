-- Applied to production 2026-11-24 through MCP.
-- Play purchases and refunds are applied by when they HAPPENED, not when they arrived.
-- A purchase whose first delivery failed can be retried after its refund was already
-- processed; it must not grant again. entitlements.play_event_at is the time of the
-- newest Play event applied. A refund that arrives before its purchase leaves a
-- premium = false row, so the late purchase is recognised as stale.
--
-- Additive: grant_entitlement / revoke_play_entitlement (067) are unchanged and still
-- used for web and manual grants. Rules kept from 067: a Play event never touches an
-- active web/grandfather/admin grant; re-granting keeps granted_at.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS play_event_at timestamptz;

-- True when the event was applied, false when a newer one already was (or a revoke
-- names a user that does not exist).
CREATE OR REPLACE FUNCTION public.apply_play_event(p_uid uuid, p_premium boolean, p_event_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_uid IS NULL OR p_premium IS NULL THEN
    RAISE EXCEPTION 'p_uid and p_premium are required' USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.entitlements AS e (user_id, premium, source, granted_at, revoked_at, updated_at, play_event_at)
  VALUES (p_uid, p_premium, 'play',
          CASE WHEN p_premium THEN now() END,
          CASE WHEN p_premium THEN NULL ELSE now() END,
          now(), COALESCE(p_event_at, now()))
  ON CONFLICT (user_id) DO UPDATE SET
    premium    = CASE WHEN e.premium AND e.source <> 'play' THEN true ELSE EXCLUDED.premium END,
    source     = CASE WHEN EXCLUDED.premium AND NOT (e.premium AND e.source <> 'play') THEN 'play' ELSE e.source END,
    granted_at = CASE WHEN EXCLUDED.premium AND NOT e.premium THEN now()
                      WHEN EXCLUDED.premium THEN COALESCE(e.granted_at, now())
                      ELSE e.granted_at END,
    revoked_at = CASE WHEN e.premium AND e.source <> 'play' THEN e.revoked_at
                      WHEN EXCLUDED.premium THEN NULL
                      WHEN e.premium THEN now()
                      ELSE e.revoked_at END,
    updated_at = now(),
    play_event_at = EXCLUDED.play_event_at
  WHERE NOT COALESCE(e.play_event_at > EXCLUDED.play_event_at, false);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
EXCEPTION WHEN foreign_key_violation THEN
  -- A transfer can name a sender whose account is gone: nothing to revoke.
  IF p_premium THEN RAISE; END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_play_event(uuid, boolean, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_play_event(uuid, boolean, timestamptz) TO service_role;
