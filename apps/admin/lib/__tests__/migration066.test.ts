import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Guards the SQL text of 066: students must never be able to write profiles.role
// (the admin console trusts it). Applied to prod by hand.
const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('066_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
const code = sql.replace(/--[^\n]*/g, '')

describe('migration 066: profiles column privileges', () => {
  it('revokes table-wide UPDATE from clients', () => {
    expect(code).toMatch(/REVOKE UPDATE ON public\.profiles FROM anon, authenticated;/)
  })

  it('grants UPDATE only on harmless columns, never role, id or created_at', () => {
    const grant = code.match(/GRANT UPDATE \(([^)]*)\)\s+ON public\.profiles TO authenticated;/)
    expect(grant).not.toBeNull()
    const cols = grant![1]!.split(',').map(c => c.trim())
    expect(cols).toEqual(expect.arrayContaining(['target_exams', 'target_courses']))
    for (const forbidden of ['role', 'id', 'created_at', 'is_premium']) expect(cols).not.toContain(forbidden)
  })

  it('has no table-wide UPDATE grant to clients', () => {
    expect(code).not.toMatch(/GRANT (ALL|UPDATE) ON (TABLE )?public\.profiles TO/i)
  })
})
