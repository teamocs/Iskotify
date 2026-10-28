import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migrations are applied by hand, so this guards the SQL text of 069: blog
// posts arrive from Drive as previews and go live only when staff publish, and
// neither table is reachable with the app keys.
const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('069_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
const code = sql.replace(/--[^\n]*/g, '')

describe('migration 069: blog posts', () => {
  it('exists as 069_blog_posts.sql', () => {
    expect(file).toBe('069_blog_posts.sql')
  })

  it("adds 'blog' to both Drive content-type checks", () => {
    expect(code).toMatch(/drive_sources_content_type_check\s+CHECK \(content_type IN \('questions', 'listings', 'announcements', 'blog'\)\)/)
    expect(code).toMatch(/drive_content_files_content_type_check\s+CHECK \(content_type IN \('listings', 'announcements', 'blog'\)\)/)
  })

  it('keeps one live preview per Doc', () => {
    expect(code).toMatch(/UNIQUE INDEX IF NOT EXISTS blog_import_batches_one_preview\s+ON public\.blog_import_batches \(drive_file_id\) WHERE status = 'preview'/)
  })

  it('locks both tables away from anon and authenticated', () => {
    for (const t of ['blog_import_batches', 'blog_posts']) {
      expect(code).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)
      expect(code).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated`)
    }
  })

  it('accepts only lowercase dashed slugs, each used once', () => {
    expect(code).toMatch(/slug\s+text NOT NULL UNIQUE CHECK \(slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$' AND char_length\(slug\) <= 120\)/)
  })

  it('fails loudly if an old content_type check survives the drop', () => {
    expect(code).toContain("RAISE EXCEPTION 'content_type check not fully dropped'")
  })

  it('delete_user_data also unlinks the announcement and blog publishers', () => {
    expect(code).toContain("'announcement_import_batches:published_by'")
    expect(code).toContain("'blog_import_batches:published_by'")
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_user_data\(uuid\) TO service_role/)
  })
})
