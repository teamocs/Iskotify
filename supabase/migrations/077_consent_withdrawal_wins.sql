-- Applied to production 2026-11-24 through MCP.
-- A withdrawal of the sensitive-data consent survives a stale device. Two devices can
-- race: one reads the backup, the other withdraws, then the first uploads its older
-- copy. Same rule as the app (utils/consent.ts mergeConsent): the latest event wins,
-- and a withdrawal time is never lost. Extends 076; the trigger is unchanged.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.strip_unconsented_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key       text;
  v_granted   numeric := 0;
  v_withdrawn numeric := 0;
BEGIN
  IF jsonb_typeof(NEW.settings) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.settings -> 'sensitiveConsentAt') = 'number' THEN
    v_granted := (NEW.settings ->> 'sensitiveConsentAt')::numeric;
  END IF;
  IF jsonb_typeof(NEW.settings -> 'sensitiveWithdrawnAt') = 'number' THEN
    v_withdrawn := (NEW.settings ->> 'sensitiveWithdrawnAt')::numeric;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.settings -> 'sensitiveWithdrawnAt') = 'number'
     AND (OLD.settings ->> 'sensitiveWithdrawnAt')::numeric > v_withdrawn THEN
    v_withdrawn := (OLD.settings ->> 'sensitiveWithdrawnAt')::numeric;
    NEW.settings := jsonb_set(NEW.settings, '{sensitiveWithdrawnAt}', OLD.settings -> 'sensitiveWithdrawnAt');
  END IF;

  IF v_granted > 0 AND v_granted > v_withdrawn THEN
    RETURN NEW;
  END IF;

  IF v_granted <> 0 THEN
    NEW.settings := jsonb_set(NEW.settings, '{sensitiveConsentAt}', '0'::jsonb);
  END IF;
  FOREACH v_key IN ARRAY ARRAY['incomeBracket', 'gwa', 'hsGwaG8', 'hsGwaG9', 'hsGwaG10', 'hsGwaG11'] LOOP
    IF NEW.settings ? v_key THEN
      NEW.settings := jsonb_set(NEW.settings, ARRAY[v_key], 'null'::jsonb);
    END IF;
  END LOOP;
  IF NEW.settings ? 'isIndigenous' THEN
    NEW.settings := jsonb_set(NEW.settings, ARRAY['isIndigenous'], 'false'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;
