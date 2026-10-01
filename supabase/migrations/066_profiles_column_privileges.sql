-- 066_profiles_column_privileges.sql
--
-- SECURITY HOTFIX (applied to prod 2026-10-01). profiles_owner_update lets a
-- signed-in user UPDATE their own profile row, and the table-level UPDATE grant
-- covered every column, including `role`. The admin console trusts
-- profiles.role = 'admin' (apps/admin/lib/admin/requireAdmin.ts and the admin
-- RLS policies), so any account could promote itself to admin.
--
-- Fix: column-level privileges. Students may update only the profile fields the
-- app writes (target_exams, target_courses) and other harmless personal fields.
-- role, id and created_at are writable only by the service role. updated_at is
-- set by the profiles_updated_at trigger, which needs no grant.
--
-- New columns added to profiles later are NOT client-writable unless granted
-- here explicitly (e.g. an is_premium flag must never be).
--
-- MANUAL VERIFICATION
--   As authenticated (own row): UPDATE profiles SET role='admin' -> permission denied;
--   UPDATE profiles SET target_exams = target_exams -> ok.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url, year_level, target_courses, region, province, city, target_exams)
  ON public.profiles TO authenticated;
