-- Test purchases (POST /api/payments/mock) are recorded as provider 'mock', so they can
-- never be mistaken for money. Only widens the CHECK; no existing row can violate it.
-- Applied to production 2026-11-24 through MCP.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.payment_events DROP CONSTRAINT IF EXISTS payment_events_provider_check;
ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_provider_check
  CHECK (provider IN ('paymongo', 'revenuecat', 'mock'));
