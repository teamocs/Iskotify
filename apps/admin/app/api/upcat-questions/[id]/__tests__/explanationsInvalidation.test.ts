import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Finding 1 (CRITICAL, reviewed): PATCH /api/upcat-questions/[id] whitelists
// options/correct_index/question_text edits but never clears
// option_explanations/strategy_tip, so ReviewCard on mobile can show a
// "why this is wrong" rationale for an option that no longer exists at that
// index (or a strategy tip that no longer matches the question). Same gap
// applies to the CSV re-import upsert in importUpcatCore.ts.
//
// The fix is a DB trigger (migration 050_clear_stale_question_explanations.sql)
// — a BEFORE UPDATE trigger covers every write path (this PATCH route, the
// CSV upsert, and any future one) without touching application code. Since
// migrations are files-only (pasted manually into the Supabase SQL editor —
// not executed by this test suite against a real Postgres instance), this
// test asserts directly on the migration file's SQL text: the trigger must
// exist, must watch the right three columns, and must clear both stale
// fields. It also asserts the flashcards trigger (012/049) was extended to
// watch its `options` column, which the reviewer flagged as an unwatched gap.
//
// This is a genuine regression guard: if a future edit to this migration (or
// its content) accidentally drops a watched column or stops clearing a
// field, this test fails.

function readMigration(filename: string): string {
  // apps/admin/app/api/upcat-questions/[id]/__tests__ -> repo root -> supabase/migrations
  const migrationPath = path.resolve(__dirname, '../../../../../../../supabase/migrations', filename)
  return fs.readFileSync(migrationPath, 'utf8')
}

describe('migration 050: clear stale option_explanations/strategy_tip on content change', () => {
  const sql = readMigration('050_clear_stale_question_explanations.sql')

  it('creates a BEFORE UPDATE trigger on upcat_questions', () => {
    expect(sql).toMatch(/CREATE TRIGGER\s+upcat_questions_clear_explanations/i)
    expect(sql).toMatch(/BEFORE UPDATE ON upcat_questions/i)
  })

  it("the trigger function watches options, correct_index, and question_text for changes", () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION clear_stale_question_explanations\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/i,
    )
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch![0]
    expect(fnBody).toMatch(/NEW\.options IS DISTINCT FROM OLD\.options/)
    expect(fnBody).toMatch(/NEW\.correct_index IS DISTINCT FROM OLD\.correct_index/)
    expect(fnBody).toMatch(/NEW\.question_text IS DISTINCT FROM OLD\.question_text/)
  })

  it('the trigger function clears option_explanations to [] and strategy_tip to empty string', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION clear_stale_question_explanations\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/i,
    )
    const fnBody = fnMatch![0]
    expect(fnBody).toMatch(/NEW\.option_explanations\s*:=\s*'\[\]'::jsonb/)
    expect(fnBody).toMatch(/NEW\.strategy_tip\s*:=\s*''/)
  })

  it('extends the flashcards clear_ai_options_on_content_change trigger to also watch `options`', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION clear_ai_options_on_content_change\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/i,
    )
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch![0]
    expect(fnBody).toMatch(/NEW\.question IS DISTINCT FROM OLD\.question/)
    expect(fnBody).toMatch(/NEW\.answer IS DISTINCT FROM OLD\.answer/)
    expect(fnBody).toMatch(/NEW\.options IS DISTINCT FROM OLD\.options/)
    // Still clears the AI distractor cache AND the Task E explanation fields.
    expect(fnBody).toMatch(/NEW\.ai_options\s*:=\s*NULL/)
    expect(fnBody).toMatch(/NEW\.option_explanations\s*:=\s*'\[\]'::jsonb/)
    expect(fnBody).toMatch(/NEW\.strategy_tip\s*:=\s*''/)
  })
})

// Documents WHY the PATCH route itself needs no code change: the whitelisted
// patch already writes the real new values of question_text/options/
// correct_index onto the row (see route.ts), which is exactly what the
// BEFORE UPDATE trigger's `NEW.x IS DISTINCT FROM OLD.x` check needs to see
// in order to fire. If a future change stopped writing one of those columns
// through when it's provided, the trigger would silently stop protecting it.
describe('PATCH /api/upcat-questions/[id] payload shape (trigger precondition)', () => {
  it('route source whitelists question_text, options, and correct_index onto the update patch', () => {
    const routeSrc = fs.readFileSync(path.resolve(__dirname, '../route.ts'), 'utf8')
    expect(routeSrc).toMatch(/patch\.question_text\s*=\s*body\.question_text/)
    expect(routeSrc).toMatch(/patch\.options\s*=\s*options/)
    expect(routeSrc).toMatch(/patch\.correct_index\s*=\s*ci/)
  })
})
