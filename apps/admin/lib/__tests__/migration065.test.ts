import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migrations are applied by hand, so this guards the SQL text of 065:
// clients (anon/authenticated) may read only PUBLISHED questions, flashcards
// and topics (and passages that belong to a published question), and learn
// about unpublished/deleted content through an id-only status feed so their
// local mirror can hide it.
const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('065_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
// Code only: comments may mention anything.
const code = sql.replace(/--[^\n]*/g, '')

/** The text of one CREATE ... statement (up to its terminating `;` or `$$;`). */
function stmt(re: RegExp): string {
  const m = code.match(re)
  return m ? m[0] : ''
}

describe('migration 065: published-only content', () => {
  it('exists as 065_published_only_content.sql', () => {
    expect(file).toBe('065_published_only_content.sql')
  })

  it('has a header and a MANUAL VERIFICATION section', () => {
    expect(sql.startsWith('-- 065_published_only_content.sql')).toBe(true)
    expect(sql).toMatch(/MANUAL VERIFICATION/)
  })

  describe('read policies', () => {
    it.each([
      ['upcat_questions', 'upcat_questions_read'],
      ['flashcards', 'flashcards_public_read'],
      ['flashcard_topics', 'topics_public_read'],
    ])('%s: the public read policy is replaced with status = published', (table, policy) => {
      expect(code).toMatch(new RegExp(`DROP POLICY IF EXISTS "?${policy}"? ON public\\.${table}\\s*;`, 'i'))
      expect(code).toMatch(new RegExp(
        `CREATE POLICY "?${policy}"? ON public\\.${table}\\s+FOR SELECT\\s+USING\\s*\\(\\s*status\\s*=\\s*'published'\\s*\\)\\s*;`, 'i'))
    })

    it('upcat_passages: readable only when a published question uses the passage', () => {
      expect(code).toMatch(/DROP POLICY IF EXISTS "?upcat_passages_read"? ON public\.upcat_passages\s*;/i)
      const p = stmt(/CREATE POLICY "?upcat_passages_read"? ON public\.upcat_passages[\s\S]*?;/i)
      expect(p).toMatch(/FOR SELECT/i)
      expect(p).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM public\.upcat_questions q/i)
      expect(p).toMatch(/q\.set_id\s*=\s*upcat_passages\.set_id/i)
      expect(p).toMatch(/q\.status\s*=\s*'published'/i)
    })

    it('no read policy is left as USING (true) and no write policy is touched', () => {
      expect(code).not.toMatch(/USING\s*\(\s*true\s*\)/i)
      expect(code).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i)
    })
  })

  describe('upcat_questions.status', () => {
    it('gets a draft/published CHECK, added NOT VALID then validated', () => {
      expect(code).toMatch(/ADD CONSTRAINT upcat_questions_status_check\s+CHECK\s*\(\s*status IN \(\s*'draft'\s*,\s*'published'\s*\)\s*\)\s*NOT VALID/i)
      expect(code).toMatch(/VALIDATE CONSTRAINT upcat_questions_status_check/i)
    })

    it('defaults to draft (a row inserted without a status is never public)', () => {
      expect(code).toMatch(/ALTER TABLE public\.upcat_questions\s+ALTER COLUMN status SET DEFAULT 'draft'/i)
    })
  })

  describe('tombstones', () => {
    it('creates content_tombstones(kind, id, deleted_at) keyed by (kind, id), RLS on, no policies', () => {
      const t = stmt(/CREATE TABLE IF NOT EXISTS public\.content_tombstones[\s\S]*?\);/i)
      expect(t).toMatch(/kind\s+text\s+NOT NULL\s+CHECK\s*\(\s*kind IN \(\s*'question'\s*,\s*'flashcard'\s*,\s*'topic'\s*\)\s*\)/i)
      expect(t).toMatch(/id\s+text\s+NOT NULL/i)
      expect(t).toMatch(/deleted_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
      expect(t).toMatch(/PRIMARY KEY\s*\(\s*kind\s*,\s*id\s*\)/i)
      expect(code).toMatch(/ALTER TABLE public\.content_tombstones ENABLE ROW LEVEL SECURITY/i)
      expect(code).not.toMatch(/CREATE POLICY[^;]*content_tombstones/i)
      expect(code).toMatch(/REVOKE ALL ON public\.content_tombstones FROM public, anon, authenticated/i)
    })

    it('trigger functions are SECURITY DEFINER with an empty search_path and not client-callable', () => {
      for (const fn of ['content_tombstone_on_delete', 'content_tombstone_on_insert']) {
        const f = stmt(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'))
        expect(f, fn).toMatch(/RETURNS trigger/i)
        expect(f, fn).toMatch(/SECURITY DEFINER/i)
        expect(f, fn).toMatch(/SET search_path\s*=\s*''/i)
        expect(code, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM public, anon, authenticated`, 'i'))
      }
      const del = stmt(/CREATE OR REPLACE FUNCTION public\.content_tombstone_on_delete\(\)[\s\S]*?\$\$;/i)
      expect(del).toMatch(/INSERT INTO public\.content_tombstones/i)
      expect(del).toMatch(/ON CONFLICT \(kind, id\) DO UPDATE SET deleted_at = now\(\)/i)
      const ins = stmt(/CREATE OR REPLACE FUNCTION public\.content_tombstone_on_insert\(\)[\s\S]*?\$\$;/i)
      expect(ins).toMatch(/DELETE FROM public\.content_tombstones/i)
    })

    it.each([
      ['upcat_questions', 'question', 'question_id'],
      ['flashcards', 'flashcard', 'id'],
      ['flashcard_topics', 'topic', 'id'],
    ])('%s has AFTER DELETE and AFTER INSERT tombstone triggers', (table, kind, idCol) => {
      expect(code).toMatch(new RegExp(
        `CREATE TRIGGER ${table}_tombstone_delete\\s+AFTER DELETE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.content_tombstone_on_delete\\(\\s*'${kind}'\\s*,\\s*'${idCol}'\\s*\\)`, 'i'))
      expect(code).toMatch(new RegExp(
        `CREATE TRIGGER ${table}_tombstone_insert\\s+AFTER INSERT ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.content_tombstone_on_insert\\(\\s*'${kind}'\\s*,\\s*'${idCol}'\\s*\\)`, 'i'))
    })
  })

  describe('content_status_feed', () => {
    const fn = stmt(/CREATE OR REPLACE FUNCTION public\.content_status_feed\([\s\S]*?\$\$;/i)

    it('takes (p_since, p_limit default 1000) plus a keyset cursor for equal timestamps', () => {
      expect(fn).toMatch(/p_since\s+timestamptz/i)
      expect(fn).toMatch(/p_limit\s+int(eger)?\s+DEFAULT 1000/i)
      expect(fn).toMatch(/p_after_kind\s+text\s+DEFAULT NULL/i)
      expect(fn).toMatch(/p_after_id\s+text\s+DEFAULT NULL/i)
    })

    it('returns ids and status only, never content columns', () => {
      expect(fn).toMatch(/RETURNS TABLE\s*\(\s*kind text,\s*id text,\s*status text,\s*changed_at timestamptz\s*\)/i)
      for (const col of ['question_text', 'options', 'explanation', 'passage_text', 'question', 'answer', 'name', 'image_url']) {
        expect(fn, col).not.toMatch(new RegExp(`\\b[a-z]\\.${col}\\b`, 'i'))
      }
      expect(fn).not.toMatch(/SELECT\s+\*/i)
    })

    it('is a STABLE SECURITY DEFINER function with an empty search_path', () => {
      expect(fn).toMatch(/STABLE/i)
      expect(fn).toMatch(/SECURITY DEFINER/i)
      expect(fn).toMatch(/SET search_path\s*=\s*''/i)
    })

    it('reads non-published rows of the three tables and tombstones of rows that no longer exist', () => {
      for (const t of ['upcat_questions', 'flashcards', 'flashcard_topics']) {
        expect(fn, t).toMatch(new RegExp(`FROM public\\.${t}\\s+\\w+\\s+WHERE\\s+\\w+\\.status\\s*<>\\s*'published'`, 'i'))
      }
      expect(fn).toMatch(/FROM public\.content_tombstones/i)
      expect(fn).toMatch(/'deleted'/)
      expect(fn).toMatch(/NOT EXISTS/i)
      expect(fn).toMatch(/ORDER BY\s+\w*\.?changed_at\s*,\s*\w*\.?kind\s*,\s*\w*\.?id/i)
    })

    it('clamps p_limit to 1..5000', () => {
      expect(fn).toMatch(/LEAST\s*\(\s*GREATEST\s*\(\s*COALESCE\s*\(\s*p_limit\s*,\s*1000\s*\)\s*,\s*1\s*\)\s*,\s*5000\s*\)/i)
    })

    it('is executable by anon, authenticated and service_role only', () => {
      const sig = 'public\\.content_status_feed\\(timestamptz,\\s*int(eger)?,\\s*text,\\s*text\\)'
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM public\\s*;`, 'i'))
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO anon, authenticated, service_role\\s*;`, 'i'))
    })
  })

  it('adds partial updated_at indexes for the non-published rows the feed scans', () => {
    for (const t of ['upcat_questions', 'flashcards', 'flashcard_topics']) {
      expect(code, t).toMatch(new RegExp(
        `CREATE INDEX IF NOT EXISTS idx_${t}_unpublished_updated_at\\s+ON public\\.${t}\\s*\\(\\s*updated_at\\s*\\)\\s+WHERE status <> 'published'`, 'i'))
    }
  })
})
