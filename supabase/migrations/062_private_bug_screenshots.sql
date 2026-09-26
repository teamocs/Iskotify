-- 062_private_bug_screenshots.sql
--
-- Bug-report screenshots become PRIVATE. Migration 036 created the
-- 'app-bug-reports' bucket as public and added a SELECT policy letting anon +
-- authenticated read every object, so anyone holding a screenshot's URL could
-- open it. Students attach screenshots of their own screens, which can show
-- personal details, and the privacy policy now says only our team can view them.
--
-- After this migration:
--   • the bucket is private (public = false): /object/public/... URLs stop working;
--   • the public-read policy is gone;
--   • the app's upload policy (036 "app_bug_reports_upload", INSERT for anon +
--     authenticated, this bucket only) is KEPT unchanged, so reporting still works;
--   • SELECT is allowed only to admins (profiles.role = 'admin'), using the
--     initplan-friendly (select auth.uid()) form from migration 060.
--
-- The admin console reads screenshots through a short-lived signed URL made
-- server-side (app/api/admin/app-reports/[id]/screenshot), with the service
-- role, which bypasses RLS; the admin SELECT policy covers any direct
-- authenticated read by an admin. The app now stores the object path in
-- app_bug_reports.image_url; older rows still hold a full public URL, and the
-- admin extracts the path from those (lib/admin/bugScreenshot.ts), so no data
-- backfill is needed.

-- 1. Make the bucket private.
UPDATE storage.buckets
SET public = false
WHERE id = 'app-bug-reports';

-- 2. Remove public read.
DROP POLICY IF EXISTS "app_bug_reports_public_read" ON storage.objects;

-- 3. Admin-only read.
DROP POLICY IF EXISTS "app_bug_reports_admin_read" ON storage.objects;
CREATE POLICY "app_bug_reports_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'app-bug-reports'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  );

-- "app_bug_reports_upload" (INSERT, anon + authenticated,
-- WITH CHECK (bucket_id = 'app-bug-reports')) is intentionally left as it is.
