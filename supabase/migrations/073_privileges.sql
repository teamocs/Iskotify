-- Applied to production 2026-11-24 through MCP. Future migrations must GRANT client-facing objects explicitly.
SET LOCAL lock_timeout = '5s';
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE ALL ON public.app_config, public.early_access_registrations, public.kb_drive_files,
  public.kb_file_mappings, public.kb_publish_events, public.kb_sync_runs,
  public.listing_import_batches, public.pdf_jobs, public.question_flag_dismissals
  FROM anon, authenticated;
REVOKE USAGE ON SEQUENCE public.kb_publish_events_id_seq, public.kb_sync_runs_id_seq,
  public.sync_logs_id_seq FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
