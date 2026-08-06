import {
  buildFocusExamSlots, buildExamPickerOptions, examAcronym, resolveFocusTileRoute,
  DEFAULT_SUGGESTED_EXAM_SLUGS, FOCUS_EXAM_SLOT_COUNT,
} from '../focusExamSlots'

describe('buildFocusExamSlots', () => {
  it('returns 6 blank slots when nothing is focused (no defaults given)', () => {
    const slots = buildFocusExamSlots([], { defaults: [] })
    expect(slots).toHaveLength(FOCUS_EXAM_SLOT_COUNT)
    expect(slots.every(s => s.kind === 'blank')).toBe(true)
  })

  it('fills suggested defaults up to 3 when fewer than 3 are focused', () => {
    const slots = buildFocusExamSlots([])
    expect(slots.filter(s => s.kind === 'suggested')).toHaveLength(3)
    expect(slots.filter(s => s.kind === 'blank')).toHaveLength(FOCUS_EXAM_SLOT_COUNT - 3)
    const suggestedSlugs = slots.filter(s => s.kind === 'suggested').map(s => (s as { slug: string }).slug)
    expect(suggestedSlugs).toEqual([...DEFAULT_SUGGESTED_EXAM_SLUGS])
  })

  it('skips a default already in Focus and only suggests the remaining ones', () => {
    const slots = buildFocusExamSlots([{ slug: 'upcat', priority: 1, title: 'UPCAT 2026' }])
    expect(slots[0]).toEqual({ kind: 'focused', slug: 'upcat', title: 'UPCAT 2026' })
    const suggested = slots.filter(s => s.kind === 'suggested').map(s => (s as { slug: string }).slug)
    expect(suggested).toEqual(['acet', 'dcat-dlsu'])
    expect(suggested).not.toContain('upcat')
  })

  it('shows no suggestions once 3+ exams are already focused', () => {
    const focused = [
      { slug: 'a', priority: 1, title: 'A' },
      { slug: 'b', priority: 2, title: 'B' },
      { slug: 'c', priority: 3, title: 'C' },
    ]
    const slots = buildFocusExamSlots(focused)
    expect(slots.filter(s => s.kind === 'suggested')).toHaveLength(0)
    expect(slots.filter(s => s.kind === 'focused')).toHaveLength(3)
    expect(slots.filter(s => s.kind === 'blank')).toHaveLength(3)
  })

  it('orders focused slots by priority and caps at the slot count', () => {
    const focused = Array.from({ length: 8 }, (_, i) => ({ slug: `x${i}`, priority: 8 - i, title: `X${i}` }))
    const slots = buildFocusExamSlots(focused)
    expect(slots).toHaveLength(FOCUS_EXAM_SLOT_COUNT)
    expect(slots.every(s => s.kind === 'focused')).toBe(true)
    // priority 1 (x7) should lead
    expect((slots[0] as { slug: string }).slug).toBe('x7')
  })

  it('never exceeds the requested slot count', () => {
    const slots = buildFocusExamSlots([], { slotCount: 4 })
    expect(slots).toHaveLength(4)
  })
})

describe('examAcronym', () => {
  it('prefers a supplied blueprint acronym', () => {
    expect(examAcronym('University of the Philippines College Admission Test', 'UPCAT')).toBe('UPCAT')
  })

  it('splits an "ACRONYM – full name" title on the en dash', () => {
    expect(examAcronym('UPCAT – University of the Philippines College Admission Test')).toBe('UPCAT')
    expect(examAcronym('ACET – Ateneo College Entrance Test')).toBe('ACET')
  })

  it('derives initials when no dash/blueprint acronym is available', () => {
    expect(examAcronym('Silliman University College Admission Test')).toBe('SUCA')
  })

  it('never returns an empty string', () => {
    expect(examAcronym('')).not.toBe('')
  })
})

describe('buildExamPickerOptions', () => {
  const examListings = [
    { slug: 'ustet', title: 'USTET – University of Santo Tomas Entrance Test' },
    { slug: 'upcat', title: 'UPCAT – University of the Philippines College Admission Test' },
    { slug: 'random-exam', title: 'Random School Entrance Exam' },
  ]
  const blueprintSlugs = ['upcat', 'ustet']
  const blueprintInfo = new Map([
    ['upcat', { acronym: 'UPCAT', name: 'UPCAT' }],
    ['ustet', { acronym: 'USTET', name: 'USTET' }],
  ])

  it('orders blueprint-backed exams first, in blueprint order', () => {
    const opts = buildExamPickerOptions(examListings, blueprintSlugs, blueprintInfo, new Set())
    expect(opts.map(o => o.slug)).toEqual(['upcat', 'ustet', 'random-exam'])
  })

  it('excludes already-focused slugs', () => {
    const opts = buildExamPickerOptions(examListings, blueprintSlugs, blueprintInfo, new Set(['upcat']))
    expect(opts.map(o => o.slug)).toEqual(['ustet', 'random-exam'])
  })

  it('caps to the requested limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ slug: `e${i}`, title: `Exam ${i}` }))
    const opts = buildExamPickerOptions(many, [], new Map(), new Set(), 9)
    expect(opts).toHaveLength(9)
  })
})

describe('resolveFocusTileRoute', () => {
  const blueprintSlugs = ['upcat', 'acet', 'ustet']

  it('routes a scored exam to its own practice/start page, regardless of blueprint', () => {
    expect(resolveFocusTileRoute('upcat', true, blueprintSlugs)).toBe('/practice/start/upcat')
    expect(resolveFocusTileRoute('acet', true, blueprintSlugs)).toBe('/practice/start/acet')
    expect(resolveFocusTileRoute('random-exam', true, [])).toBe('/practice/start/random-exam')
  })

  it('routes a scoreless UPCAT tile to the diagnostic (diagnostic content is UPCAT-based)', () => {
    expect(resolveFocusTileRoute('upcat', false, blueprintSlugs)).toBe('/practice/diagnostic')
  })

  it('routes a scoreless non-UPCAT tile with its own published blueprint to practice/start/:slug', () => {
    expect(resolveFocusTileRoute('acet', false, blueprintSlugs)).toBe('/practice/start/acet')
    expect(resolveFocusTileRoute('ustet', false, blueprintSlugs)).toBe('/practice/start/ustet')
  })

  it('routes a scoreless exam with no published blueprint to the diagnostic', () => {
    expect(resolveFocusTileRoute('random-exam', false, blueprintSlugs)).toBe('/practice/diagnostic')
    expect(resolveFocusTileRoute('acet', false, [])).toBe('/practice/diagnostic')
  })
})
