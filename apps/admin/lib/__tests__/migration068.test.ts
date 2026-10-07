import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Guards the SQL text of 068: Drive sources (which folders the sync reads, and
// as what), the per-file ledger for listings/announcements files, the
// announcement preview batches, and the Drive tagging of listing previews.
// Everything is service-role only (the admin API); applied to prod by hand.
const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('068_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
const code = sql.replace(/--[^\n]*/g, '')

function table(name: string): string {
  const m = code.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}\\s*\\(([\\s\\S]*?)\\n\\);`))
  return m ? m[1]! : ''
}

const SERVICE_ONLY = ['drive_sources', 'drive_content_files', 'announcement_import_batches']

describe('migration 068: Drive content sources', () => {
  it('exists as 068_drive_content_sources.sql', () => {
    expect(file).toBe('068_drive_content_sources.sql')
  })

  it('creates drive_sources: one row per (folder, content type), enabled by default', () => {
    const t = table('drive_sources')
    expect(t).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT gen_random_uuid\(\)/i)
    expect(t).toMatch(/content_type\s+text\s+NOT NULL\s+CHECK\s*\(\s*content_type IN \('questions',\s*'listings',\s*'announcements'\)\s*\)/i)
    expect(t).toMatch(/folder_id\s+text\s+NOT NULL/i)
    expect(t).toMatch(/label\s+text/i)
    expect(t).toMatch(/enabled\s+boolean\s+NOT NULL\s+DEFAULT true/i)
    expect(t).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
    expect(t).toMatch(/updated_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
    expect(t).toMatch(/UNIQUE\s*\(folder_id,\s*content_type\)/i)
  })

  it('seeds nothing (the questions folder still comes from KB_DRIVE_FOLDER_ID)', () => {
    expect(code).not.toMatch(/INSERT INTO/i)
  })

  it('creates the listings/announcements file ledger keyed by (content_type, drive_file_id)', () => {
    const t = table('drive_content_files')
    expect(t).toMatch(/content_type\s+text\s+NOT NULL\s+CHECK\s*\(\s*content_type IN \('listings',\s*'announcements'\)\s*\)/i)
    expect(t).toMatch(/drive_file_id\s+text\s+NOT NULL/i)
    expect(t).toMatch(/md5_checksum\s+text/i)
    expect(t).toMatch(/drive_modified_at\s+timestamptz/i)
    expect(t).toMatch(/status\s+text\s+NOT NULL\s+CHECK\s*\(\s*status IN \('previewed',\s*'no_changes',\s*'held',\s*'skipped',\s*'error'\)\s*\)/i)
    expect(t).toMatch(/source_id\s+uuid\s+REFERENCES public\.drive_sources\s*\(id\)\s+ON DELETE SET NULL/i)
    expect(t).toMatch(/PRIMARY KEY\s*\(content_type,\s*drive_file_id\)/i)
  })

  it('creates announcement_import_batches with the preview → published/discarded lifecycle', () => {
    const t = table('announcement_import_batches')
    expect(t).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT gen_random_uuid\(\)/i)
    expect(t).toMatch(/drive_file_id\s+text\s+NOT NULL/i)
    expect(t).toMatch(/status\s+text\s+NOT NULL\s+DEFAULT 'preview'\s+CHECK\s*\(\s*status IN \('preview',\s*'published',\s*'discarded'\)\s*\)/i)
    expect(t).toMatch(/rows\s+jsonb\s+NOT NULL\s+DEFAULT '\[\]'::jsonb/i)
    expect(t).toMatch(/skipped\s+jsonb\s+NOT NULL\s+DEFAULT '\[\]'::jsonb/i)
    for (const c of ['new_count', 'update_count', 'unchanged_count', 'skipped_count', 'published_count']) {
      expect(t).toMatch(new RegExp(`${c}\\s+integer\\s+NOT NULL\\s+DEFAULT 0`, 'i'))
    }
    expect(t).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
    expect(t).toMatch(/published_at\s+timestamptz/i)
    expect(t).toMatch(/published_by\s+uuid/i)
    expect(t).toMatch(/discarded_at\s+timestamptz/i)
  })

  it('allows one live preview per Drive file (announcements and listings)', () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON public\.announcement_import_batches\s*\(drive_file_id\)\s+WHERE status = 'preview';/i)
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON public\.listing_import_batches\s*\(drive_file_id\)\s+WHERE status = 'preview' AND drive_file_id IS NOT NULL;/i)
  })

  it('tags listing previews with where they came from, defaulting existing rows to the pasted-link flow', () => {
    expect(code).toMatch(/ALTER TABLE public\.listing_import_batches[\s\S]*ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sheet_link'\s+CHECK \(source IN \('sheet_link', 'drive'\)\)/i)
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS drive_file_id text/i)
  })

  it('keeps every new table service-role only: RLS on, no policies, no client grants', () => {
    for (const t of SERVICE_ONLY) {
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`))
      expect(code).toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated;`))
      expect(code).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${t}`, 'i'))
      expect(code).not.toMatch(new RegExp(`GRANT[^;]*ON (TABLE )?public\\.${t} TO (anon|authenticated)`, 'i'))
    }
  })

  it('keeps updated_at current on drive_sources', () => {
    expect(code).toMatch(/CREATE TRIGGER drive_sources_updated_at\s+BEFORE UPDATE ON public\.drive_sources\s+FOR EACH ROW EXECUTE FUNCTION update_updated_at\(\);/i)
  })

  it('documents manual verification', () => {
    expect(sql).toMatch(/MANUAL VERIFICATION/)
  })
})
