import {
  resolveDiagnosticTarget,
  blueprintDiagnosticSectionSize,
  buildBlueprintDiagnostic,
  buildBlueprintDiagnosticSessionParams,
  blueprintDiagnosticToAttemptMeta,
  blueprintDiagnosticPool,
  normalizeExamParam,
  firstParam,
  examSlugLabel,
  diagnosticRunKey,
  diagnosticRunSlug,
  BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS,
} from '../diagnosticTarget'
import { runKeyFor } from '../examRunPersistence'
import type { ExamBlueprint, BlueprintSection } from '../../services/examBlueprints'
import type { RawUpcatQuestion, RawUpcatPassage } from '../upcatExam'

// ---- fixtures --------------------------------------------------------------

function qs(category: string, n: number, subtest = category, prefix = category): RawUpcatQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `${prefix}-${i}`, subtest, questionText: `Q ${prefix} ${i}`, options: ['a', 'b', 'c', 'd'],
    correctIndex: 0, explanation: '', setId: null, setPosition: null,
  }))
}
function section(i: number, name: string, skillCategory: string, itemCount = 40): BlueprintSection {
  return { id: `acet:${i}`, name, skillCategory, itemCount, timeMinutes: null, requiresSpatialLogic: false, displayOrder: i }
}
function blueprint(sections: BlueprintSection[], slug = 'acet'): ExamBlueprint {
  return {
    slug, name: 'Ateneo College Entrance Test', acronym: slug.toUpperCase(), totalItems: 100, totalTimeMinutes: 120,
    hasGuessingPenalty: false, guessingPenalty: 0, sectionBlocked: false, scoringNote: '', mechanicsNote: '',
    sections, courseNotes: [],
  }
}

// ---- 1. target resolution --------------------------------------------------

describe('resolveDiagnosticTarget', () => {
  const runnable = ['upcat', 'acet', 'ustet']

  it('an explicit ?exam= wins over the focus order', () => {
    expect(resolveDiagnosticTarget({ examParam: 'ustet', focusSlugs: ['acet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'blueprint', slug: 'ustet' })
  })

  it('an explicit ?exam=upcat is the UPCAT diagnostic', () => {
    expect(resolveDiagnosticTarget({ examParam: 'upcat', focusSlugs: ['acet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'upcat' })
  })

  it('an explicit ?exam= with no runnable blueprint is unavailable (never silently UPCAT)', () => {
    expect(resolveDiagnosticTarget({ examParam: 'dcat-dlsu', focusSlugs: ['upcat'], runnableSlugs: runnable }))
      .toEqual({ kind: 'unavailable', slug: 'dcat-dlsu' })
  })

  it('without a param, the primary focus exam with a runnable blueprint is used', () => {
    expect(resolveDiagnosticTarget({ focusSlugs: ['school:12', 'acet', 'ustet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'blueprint', slug: 'acet' })
  })

  it('without a param, focus exams with no runnable blueprint are skipped', () => {
    expect(resolveDiagnosticTarget({ focusSlugs: ['dcat-dlsu', 'ustet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'blueprint', slug: 'ustet' })
  })

  it('a primary focus of UPCAT resolves to the UPCAT diagnostic', () => {
    expect(resolveDiagnosticTarget({ focusSlugs: ['upcat', 'acet'], runnableSlugs: runnable })).toEqual({ kind: 'upcat' })
  })

  it('falls back to UPCAT with no focus or no runnable focus exam', () => {
    expect(resolveDiagnosticTarget({ focusSlugs: [], runnableSlugs: runnable })).toEqual({ kind: 'upcat' })
    expect(resolveDiagnosticTarget({ focusSlugs: ['dcat-dlsu'], runnableSlugs: runnable })).toEqual({ kind: 'upcat' })
  })

  it('a ?subject= (a UPCAT subtest) without ?exam= stays on the UPCAT diagnostic', () => {
    expect(resolveDiagnosticTarget({ subjectParam: 'Mathematics', focusSlugs: ['acet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'upcat' })
  })

  it('an explicit ?exam=school:<id> resolves to the general entrance exam (its content slug)', () => {
    expect(resolveDiagnosticTarget({ examParam: 'school:abc', focusSlugs: [], runnableSlugs: [...runnable, 'general-cet'] }))
      .toEqual({ kind: 'blueprint', slug: 'general-cet' })
    expect(resolveDiagnosticTarget({ examParam: 'school:abc', focusSlugs: [], runnableSlugs: runnable }))
      .toEqual({ kind: 'unavailable', slug: 'general-cet' })
  })

  it('an empty ?exam= is ignored', () => {
    expect(resolveDiagnosticTarget({ examParam: '', focusSlugs: ['acet'], runnableSlugs: runnable }))
      .toEqual({ kind: 'blueprint', slug: 'acet' })
  })
})

// ---- 2. non-UPCAT build ----------------------------------------------------

describe('blueprintDiagnosticSectionSize', () => {
  it('is 5 per section, shrinking only so the whole diagnostic stays within the cap', () => {
    expect(BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS).toBe(30)
    expect(blueprintDiagnosticSectionSize(3)).toBe(5)
    expect(blueprintDiagnosticSectionSize(6)).toBe(5)
    expect(blueprintDiagnosticSectionSize(10)).toBe(3)
    expect(blueprintDiagnosticSectionSize(40)).toBe(2) // never below 2
    expect(blueprintDiagnosticSectionSize(0)).toBe(5)
  })
})

describe('buildBlueprintDiagnostic', () => {
  it('samples a small fixed number per runnable section, labelled with the section display name', () => {
    const bp = blueprint([section(1, 'Math', 'Mathematics'), section(2, 'English', 'English')])
    const pools = new Map([['Mathematics', qs('Mathematics', 20)], ['English', qs('English', 20)]])
    const built = buildBlueprintDiagnostic(bp, pools, [])
    expect(built.questions).toHaveLength(10)
    expect(built.questions.filter(q => q.subject === 'Math')).toHaveLength(5)
    expect(built.questions.filter(q => q.subject === 'English')).toHaveLength(5)
    expect(built.comingSoon).toEqual([])
  })

  it('never exceeds the section item_count and skips empty sections, reporting them as not available', () => {
    const bp = blueprint([section(1, 'Math', 'Mathematics', 3), section(2, 'Abstract', 'Abstract'), section(3, 'English', 'English')])
    const pools = new Map([['Mathematics', qs('Mathematics', 20)], ['English', qs('English', 2)]])
    const built = buildBlueprintDiagnostic(bp, pools, [])
    expect(built.questions.filter(q => q.subject === 'Math')).toHaveLength(3)
    expect(built.questions.filter(q => q.subject === 'English')).toHaveLength(2)
    expect(built.questions.some(q => q.subject === 'Abstract')).toBe(false)
    expect(built.comingSoon.map(s => s.name)).toEqual(['Abstract'])
  })

  it('keeps passage sets whole and contiguous with the passage attached', () => {
    const passage: RawUpcatPassage = { setId: 'P1', subtest: 'Reading Comprehension', passageText: 'The passage.' }
    const set = Array.from({ length: 4 }, (_, i) => ({
      questionId: `RC-${i}`, subtest: 'Reading Comprehension', questionText: `RC ${i}`, options: ['a', 'b', 'c', 'd'],
      correctIndex: 0, explanation: '', setId: 'P1', setPosition: i + 1,
    }))
    const bp = blueprint([section(1, 'Reading', 'Reading Comprehension')])
    const built = buildBlueprintDiagnostic(bp, new Map([['Reading Comprehension', set]]), [passage])
    // Only one 4-question set exists: it is served whole (never truncated to 5 nor cut).
    expect(built.questions.map(q => q.id)).toEqual(['RC-0', 'RC-1', 'RC-2', 'RC-3'])
    expect(built.questions.every(q => q.passageText === 'The passage.')).toBe(true)
  })

  it('excludes questions whose required figure is missing', () => {
    const broken: RawUpcatQuestion = { ...qs('Mathematics', 1)[0]!, questionId: 'broken', hasVisual: true, imageUrl: null }
    const bp = blueprint([section(1, 'Math', 'Mathematics')])
    const built = buildBlueprintDiagnostic(bp, new Map([['Mathematics', [broken, ...qs('Mathematics', 6)]]]), [])
    expect(built.questions.map(q => q.id)).not.toContain('broken')
  })

  it('carries the canonical subtest of each question (not the section label)', () => {
    const bp = blueprint([section(1, 'Language Proficiency (English & Filipino)', 'Language')])
    const built = buildBlueprintDiagnostic(bp, new Map([['Language', qs('Language', 8, 'Language Proficiency')]]), [])
    expect(built.questions.every(q => q.subject === 'Language Proficiency (English & Filipino)')).toBe(true)
    expect(built.questions.every(q => q.subtest === 'Language Proficiency')).toBe(true)
  })

  it('reports an empty build when no section has content', () => {
    const built = buildBlueprintDiagnostic(blueprint([section(1, 'Math', 'Mathematics')]), new Map(), [])
    expect(built.questions).toEqual([])
    expect(built.comingSoon).toHaveLength(1)
  })
})

describe('blueprintDiagnosticPool', () => {
  it('lists every runnable question once (shared ids de-duplicated) with its passage attached', () => {
    const shared = qs('A', 2)
    const withPassage: RawUpcatQuestion = { ...qs('B', 1)[0]!, setId: 'P9', setPosition: 1 }
    const pool = blueprintDiagnosticPool(
      new Map([['A', shared], ['B', [withPassage, shared[0]!]]]),
      [{ setId: 'P9', subtest: 'Reading Comprehension', passageText: 'Passage 9' }],
    )
    expect(pool.map(q => q.id).sort()).toEqual(['A-0', 'A-1', 'B-0'])
    expect(pool.find(q => q.id === 'B-0')?.passageText).toBe('Passage 9')
    expect(pool.find(q => q.id === 'A-0')?.passageText).toBeNull()
  })
})

// ---- 3. recording ----------------------------------------------------------

describe('buildBlueprintDiagnosticSessionParams', () => {
  const bp = blueprint([
    section(1, 'Language Proficiency (English & Filipino)', 'Language'),
    section(2, 'Math', 'Mathematics'),
  ])
  const pools = new Map([['Language', qs('Language', 5, 'Language Proficiency')], ['Mathematics', qs('Mathematics', 5)]])
  const { questions } = buildBlueprintDiagnostic(bp, pools, [])

  it('records kind diagnostic under the exam slug with the start as attemptKey and the canonical subtest', () => {
    const answers: Record<number, number> = {}
    questions.forEach((_, i) => { answers[i] = 0 }) // correctIndex is 0 for all
    const params = buildBlueprintDiagnosticSessionParams('acet', questions, answers, undefined, 1234)
    expect(params).toHaveLength(2)
    expect(params.map(p => p.subtest).sort()).toEqual(['Language Proficiency', 'Mathematics'])
    for (const p of params) {
      expect(p).toMatchObject({ listingSlug: 'acet', kind: 'diagnostic', attemptKey: 1234, startTime: 1234, topicId: '', deckId: '', total: 5, score: 5 })
    }
  })

  it('counts only reached questions and writes no row for an unreached section', () => {
    const reached = new Set<number>(questions.map((_, i) => i).filter(i => questions[i]!.subject === 'Math'))
    const params = buildBlueprintDiagnosticSessionParams('acet', questions, {}, reached, 99)
    expect(params).toHaveLength(1)
    expect(params[0]).toMatchObject({ subtest: 'Mathematics', total: 5, score: 0 })
  })
})

describe('blueprintDiagnosticToAttemptMeta', () => {
  it('uses the canonical subtest for attempts and the question topic', () => {
    const bp = blueprint([section(1, 'Language Proficiency (English & Filipino)', 'Language')])
    const base = qs('Language', 5, 'Language Proficiency')
    base[0] = { ...base[0]!, topic: 'Grammar' }
    const { questions } = buildBlueprintDiagnostic(bp, new Map([['Language', base]]), [])
    const metas = blueprintDiagnosticToAttemptMeta(questions)
    expect(metas.every(m => m.subtest === 'Language Proficiency')).toBe(true)
    expect(metas.find(m => m.questionId === 'Language-0')?.topic).toBe('Grammar')
    expect(metas[0]).toHaveProperty('correctIndex', 0)
  })
})

// ---- 4. run keying ---------------------------------------------------------

describe('diagnostic run keys', () => {
  it('keeps the UPCAT keys exactly as before (subject or all)', () => {
    expect(diagnosticRunKey({ kind: 'upcat' }, undefined)).toBe(runKeyFor('diagnostic', 'all'))
    expect(diagnosticRunKey({ kind: 'upcat' }, 'Science')).toBe(runKeyFor('diagnostic', 'Science'))
    expect(diagnosticRunSlug({ kind: 'upcat' }, undefined)).toBe('all')
    expect(diagnosticRunSlug({ kind: 'upcat' }, 'Science')).toBe('Science')
  })

  it('keys an exam diagnostic by the exam so a UPCAT run can never resume as ACET', () => {
    const acet = diagnosticRunKey({ kind: 'blueprint', slug: 'acet' }, undefined)
    expect(acet).not.toBe(diagnosticRunKey({ kind: 'upcat' }, undefined))
    expect(acet).not.toBe(diagnosticRunKey({ kind: 'blueprint', slug: 'ustet' }, undefined))
    expect(diagnosticRunSlug({ kind: 'blueprint', slug: 'acet' }, undefined)).toBe('acet')
  })

  it('does not let a subject value collide with an exam key', () => {
    expect(diagnosticRunKey({ kind: 'blueprint', slug: 'all' }, undefined)).not.toBe(diagnosticRunKey({ kind: 'upcat' }, undefined))
  })
})

// ---- review fixes ----------------------------------------------------------

describe('normalizeExamParam / firstParam', () => {
  it('takes the first value of an array, trims and lowercases', () => {
    expect(normalizeExamParam(['  ACET ', 'ustet'])).toBe('acet')
    expect(normalizeExamParam('UpCat')).toBe('upcat')
    expect(normalizeExamParam(' DCAT-DLSU ')).toBe('dcat-dlsu')
  })
  it('is undefined for missing, empty or blank values', () => {
    expect(normalizeExamParam(undefined)).toBeUndefined()
    expect(normalizeExamParam('')).toBeUndefined()
    expect(normalizeExamParam('   ')).toBeUndefined()
    expect(normalizeExamParam([])).toBeUndefined()
  })
  it('firstParam keeps case (subtest names) but takes the first array value', () => {
    expect(firstParam(['Science', 'Mathematics'])).toBe('Science')
    expect(firstParam(undefined)).toBeUndefined()
  })
  it('examSlugLabel never throws', () => {
    expect(examSlugLabel('dcat-dlsu')).toBe('DCAT-DLSU')
    expect(examSlugLabel(undefined as unknown as string)).toBe('')
    expect(examSlugLabel(['x'] as unknown as string)).toBe('')
  })
})
