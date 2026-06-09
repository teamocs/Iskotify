-- Security hardening (audit 2026-06-09): pin search_path on trigger functions so it
-- can't be hijacked by a caller's role-mutable search_path (Supabase advisor 0011).
-- These two only use built-ins (now()) / column assignments, so public+pg_temp is safe.
alter function public.update_updated_at() set search_path = public, pg_temp;
alter function public.clear_ai_options_on_content_change() set search_path = public, pg_temp;
