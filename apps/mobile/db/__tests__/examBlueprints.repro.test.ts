import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { examBlueprints, examBlueprintSections } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column */ } }
  return drizzle(raw, { schema })
}

describe('exam_blueprints — real CREATE_SQL + MIGRATIONS', () => {
  it('inserts a blueprint + section without NOT NULL violations (drift guard)', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values({ slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 240, totalTimeMinutes: 300, hasGuessingPenalty: true })
    await db.insert(examBlueprintSections).values({ id: 'upcat:1', blueprintSlug: 'upcat', name: 'Mathematics', skillCategory: 'Mathematics', itemCount: 60 })
    const bp = await db.select().from(examBlueprints).where(eq(examBlueprints.slug, 'upcat')).limit(1)
    expect(bp[0]?.hasGuessingPenalty).toBe(true)
    expect(bp[0]?.guessingPenalty).toBe(0.25)
    const sec = await db.select().from(examBlueprintSections).where(eq(examBlueprintSections.blueprintSlug, 'upcat'))
    expect(sec[0]?.itemCount).toBe(60)
    expect(sec[0]?.timeMinutes).toBeNull()
  })
})
