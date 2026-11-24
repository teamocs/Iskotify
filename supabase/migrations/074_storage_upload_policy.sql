-- Applied to production 2026-11-24 through MCP. Separate because storage.objects is owned by supabase_storage_admin:
-- if this role cannot alter it, only this file fails.
ALTER POLICY app_bug_reports_upload ON storage.objects
  WITH CHECK (bucket_id = 'app-bug-reports'
              AND name ~ '^[0-9]{13}-[a-z0-9]{1,8}\.(png|jpg|webp|heic)$');
