-- Security hardening (audit 2026-06-09): SECURITY DEFINER functions must not be
-- publicly executable as REST RPCs (Supabase advisors 0028/0029). Trigger functions
-- still fire as the function owner regardless of EXECUTE grants; the admin app invokes
-- the projection via the service-role key (unaffected). Reversible via GRANT.

-- Auth trigger — never meant to be a callable RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Internal RLS utility.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

-- Admin-only projection (anon could otherwise trigger heavy flashcard re-writes).
revoke execute on function public.project_question_bank_to_flashcards() from public, anon, authenticated;
grant execute on function public.project_question_bank_to_flashcards() to service_role;

-- Dead RPC: the Admission Score Estimator was removed from the app.
revoke execute on function public.estimate_admission_score(jsonb) from public, anon, authenticated;
