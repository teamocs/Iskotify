import { pickNextPractice, nextPracticeCopy, type NextPracticeInput } from '../nextPracticeAction'

const none: NextPracticeInput = {
  resume: null,
  dueCount: 0,
  weakTopic: null,
  focusMock: null,
}

describe('pickNextPractice', () => {
  it('resumes an unfinished mock before anything else', () => {
    const next = pickNextPractice({
      ...none,
      resume: { slug: 'upcat', title: 'UPCAT', answered: 12, total: 40 },
      dueCount: 9,
      weakTopic: { id: 't1', name: 'Fractions' },
      focusMock: { slug: 'upcat', title: 'UPCAT', items: 40, minutes: 60 },
    })
    expect(next).toEqual({ kind: 'resume', slug: 'upcat', title: 'UPCAT', answered: 12, total: 40 })
  })

  it('reviews due cards next, when any are due', () => {
    const next = pickNextPractice({ ...none, dueCount: 3, weakTopic: { id: 't1', name: 'Fractions' } })
    expect(next).toEqual({ kind: 'due', count: 3 })
  })

  it('drills the weakest topic when nothing is due', () => {
    const next = pickNextPractice({
      ...none,
      weakTopic: { id: 't1', name: 'Fractions' },
      focusMock: { slug: 'upcat', title: 'UPCAT', items: 40, minutes: 60 },
    })
    expect(next).toEqual({ kind: 'topic', topicId: 't1', topicName: 'Fractions' })
  })

  it('suggests the focus exam mock when there is no weak topic yet', () => {
    const next = pickNextPractice({ ...none, focusMock: { slug: 'acet', title: 'ACET', items: 120, minutes: 120 } })
    expect(next).toEqual({ kind: 'mock', slug: 'acet', title: 'ACET', items: 120, minutes: 120 })
  })

  it('falls back to the diagnostic for a brand-new student', () => {
    expect(pickNextPractice(none)).toEqual({ kind: 'diagnostic' })
  })

  it('drills the weakest UPCAT subtest when there is no weak flashcard topic', () => {
    const next = pickNextPractice({
      ...none,
      subtestAccuracy: [{ subtest: 'Science', pct: 72 }, { subtest: 'Mathematics', pct: 41 }, { subtest: 'Reading Comprehension', pct: 55 }],
      focusMock: { slug: 'upcat', title: 'UPCAT', items: 40, minutes: 60 },
    })
    expect(next).toEqual({ kind: 'subtest', subtest: 'Mathematics' })
  })

  it('keeps a weak flashcard topic ahead of a weak subtest', () => {
    const next = pickNextPractice({
      ...none,
      weakTopic: { id: 't1', name: 'Fractions' },
      subtestAccuracy: [{ subtest: 'Mathematics', pct: 30 }],
    })
    expect(next).toEqual({ kind: 'topic', topicId: 't1', topicName: 'Fractions' })
  })

  it('does not call a subtest weak at or above the weak threshold (60%)', () => {
    const next = pickNextPractice({ ...none, subtestAccuracy: [{ subtest: 'Science', pct: 60 }], hasTakenDiagnostic: true })
    expect(next).toEqual({ kind: 'drill', subtest: 'Science' })
  })

  it('never re-offers the diagnostic once it was taken: drills the lowest subtest', () => {
    const next = pickNextPractice({
      ...none,
      hasTakenDiagnostic: true,
      subtestAccuracy: [{ subtest: 'Science', pct: 90 }, { subtest: 'Language Proficiency', pct: 70 }],
    })
    expect(next).toEqual({ kind: 'drill', subtest: 'Language Proficiency' })
  })

  it('offers a mixed drill after the diagnostic when no subtest has a number yet', () => {
    expect(pickNextPractice({ ...none, hasTakenDiagnostic: true })).toEqual({ kind: 'drill', subtest: null })
  })

  it('still prefers the focus mock over a drill after the diagnostic', () => {
    const next = pickNextPractice({ ...none, hasTakenDiagnostic: true, focusMock: { slug: 'acet', title: 'ACET', items: 120, minutes: 120 } })
    expect(next.kind).toBe('mock')
  })

  it('ignores a resume entry with no questions and a non-positive due count', () => {
    const next = pickNextPractice({ ...none, resume: { slug: 'x', title: 'X', answered: 0, total: 0 }, dueCount: -1 })
    expect(next).toEqual({ kind: 'diagnostic' })
  })
})

describe('nextPracticeCopy', () => {
  it('names the action and routes to the saved run', () => {
    const c = nextPracticeCopy({ kind: 'resume', slug: 'upcat', title: 'UPCAT', answered: 12, total: 40 })
    expect(c.title).toBe('Finish your UPCAT mock')
    expect(c.body).toBe('12 of 40 answered. Your answers and timer were saved.')
    expect(c.actionLabel).toBe('Resume mock')
    expect(c.href).toBe('/practice/exam/upcat')
  })

  it('pluralises due cards and routes to the due queue', () => {
    expect(nextPracticeCopy({ kind: 'due', count: 1 }).title).toBe('Review 1 due card')
    const c = nextPracticeCopy({ kind: 'due', count: 7 })
    expect(c.title).toBe('Review 7 due cards')
    expect(c.actionLabel).toBe('Start review')
    expect(c.href).toBe('/practice/due')
  })

  it('routes a topic drill to the topic', () => {
    const c = nextPracticeCopy({ kind: 'topic', topicId: 't1', topicName: 'Fractions' })
    expect(c.title).toBe('Drill Fractions')
    expect(c.href).toBe('/practice/t1')
  })

  it('describes a mock by its size and length, in hours when long', () => {
    const c = nextPracticeCopy({ kind: 'mock', slug: 'upcat', title: 'UPCAT', items: 180, minutes: 150 })
    expect(c.title).toBe('Take a UPCAT mock')
    expect(c.body).toBe('180 items · 2.5 h. Or try a 30-minute Study Sprint from the same screen.')
    expect(c.href).toBe('/practice/exam/upcat')
  })

  it('describes a short mock in minutes', () => {
    expect(nextPracticeCopy({ kind: 'mock', slug: 's', title: 'S', items: 20, minutes: 45 }).body)
      .toBe('20 items · 45 min. Or try a 30-minute Study Sprint from the same screen.')
  })

  it('routes a subtest drill to the UPCAT quick drill for that subtest', () => {
    const c = nextPracticeCopy({ kind: 'subtest', subtest: 'Reading Comprehension' })
    expect(c.title).toBe('Drill Reading Comprehension')
    expect(c.actionLabel).toBe('Start drill')
    expect(c.href).toBe('/practice/upcat/Reading%20Comprehension?mode=quick')
  })

  it('routes the post-diagnostic drill to a subtest, or a mixed quick drill', () => {
    const one = nextPracticeCopy({ kind: 'drill', subtest: 'Science' })
    expect(one.title).toBe('Keep Science sharp')
    expect(one.href).toBe('/practice/upcat/Science?mode=quick')
    const mixed = nextPracticeCopy({ kind: 'drill', subtest: null })
    expect(mixed.title).toBe('Keep your skills sharp')
    expect(mixed.href).toBe('/practice/upcat/all?mode=quick')
    expect(mixed.actionLabel).toBe('Start drill')
  })

  it('offers the diagnostic to a new student', () => {
    const c = nextPracticeCopy({ kind: 'diagnostic' })
    expect(c.title).toBe('Find your starting point')
    expect(c.actionLabel).toBe('Take the diagnostic')
    expect(c.href).toBe('/practice/diagnostic')
  })
})
