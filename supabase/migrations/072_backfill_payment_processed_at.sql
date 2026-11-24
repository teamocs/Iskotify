-- Applied to production 2026-11-24 through MCP. Data only (3 sandbox rows on 2026-11-24). Run after 071 and
-- before the webhook deploy. Marking a row processed means a retry of it is ignored.
UPDATE public.payment_events SET processed_at = received_at WHERE processed_at IS NULL;
