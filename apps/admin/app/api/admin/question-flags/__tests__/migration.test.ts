import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migrations are applied by hand (not run by this suite), so this guards the
// SQL text itself: the table the review queue and /api/admin/question-flags use.
function readMigration(filename: string): string {
  // apps/admin/app/api/admin/question-flags/__tests__ -> repo root -> supabase/migrations
  return fs.readFileSync(path.resolve(__dirname, '../../../../../../../supabase/migrations', filename), 'utf8')
}

describe('migration 059: question_flag_dismissals', () => {
  const sql = readMigration('059_question_flag_dismissals.sql')

  it('creates the table idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+question_flag_dismissals/i)
  })

  it('has the dismissal columns', () => {
    expect(sql).toMatch(/question_id\s+text\s+NOT NULL/i)
    expect(sql).toMatch(/options_fingerprint\s+text\s+NOT NULL/i)
    expect(sql).toMatch(/dismissed_by\s+uuid\s+REFERENCES\s+auth\.users(\s*\(\s*id\s*\))?\s+ON DELETE SET NULL/i)
    expect(sql).toMatch(/dismissed_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i)
  })

  it('keys a dismissal by question and options fingerprint', () => {
    expect(sql).toMatch(/PRIMARY KEY\s*\(\s*question_id\s*,\s*options_fingerprint\s*\)/i)
  })

  it('enables RLS and grants no client policies (service role only)', () => {
    expect(sql).toMatch(/ALTER TABLE\s+question_flag_dismissals\s+ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
