import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { examBlueprints, examBlueprintSections, examCourseNotes } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import { getExamBlueprint, listPublishedBlueprintSlugs, getQuestionsByCategory } from '../examBlueprints'
import { upcatQuestions } from '../../db/schema'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch {} }
  return drizzle(raw, { schema }) as any
}

describe('getExamBlueprint', () => {
  it('returns the blueprint with its sections (ordered) and course notes', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values({ slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', status: 'published', totalTimeMinutes: 300 })
    await db.insert(examBlueprintSections).values([
      { id: 'upcat:2', blueprintSlug: 'upcat', name: 'Science', skillCategory: 'Science', itemCount: 60, displayOrder: 2 },
      { id: 'upcat:1', blueprintSlug: 'upcat', name: 'Math', skillCategory: 'Mathematics', itemCount: 60, displayOrder: 1 },
    ])
    await db.insert(examCourseNotes).values({ id: 'upcat:nursing', blueprintSlug: 'upcat', courseCluster: 'Health Sciences', note: '90th+' })
    const bp = await getExamBlueprint(db, 'upcat')
    expect(bp?.name).toBe('UPCAT')
    expect(bp?.sections.map((s: any) => s.name)).toEqual(['Math', 'Science'])
    expect(bp?.courseNotes[0]?.note).toBe('90th+')
  })

  it('returns null for an unknown or unpublished slug', async () => {
    const db = makeDb()
    expect(await getExamBlueprint(db, 'nope')).toBeNull()
  })

  it('lists only published blueprint slugs', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values([
      { slug: 'upcat', name: 'UPCAT', status: 'published', displayOrder: 1 },
      { slug: 'acet', name: 'ACET', status: 'draft', displayOrder: 2 },
    ])
    expect(await listPublishedBlueprintSlugs(db)).toEqual(['upcat'])
  })
})

describe('getQuestionsByCategory', () => {
  it('groups parsed questions by skill_category', async () => {
    const db = makeDb()
    await db.insert(upcatQuestions).values([
      { questionId: 'm1', subtest: 'Mathematics', skillCategory: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1','2','3','4']), correctIndex: 1, explanation: '' },
      { questionId: 's1', subtest: 'Science', skillCategory: 'Science', questionText: 'H2O?', options: JSON.stringify(['a','b','c','d']), correctIndex: 0, explanation: '' },
    ])
    const map = await getQuestionsByCategory(db, ['Mathematics', 'Science', 'Spatial'])
    expect(map.get('Mathematics')).toHaveLength(1)
    expect(map.get('Mathematics')![0]!.options).toEqual(['1','2','3','4'])
    expect(map.get('Science')).toHaveLength(1)
    expect(map.get('Spatial') ?? []).toHaveLength(0)
  })
})
