import {
  buildCoachPrompt, parseCoachPhrase, computeContextHash,
  type CoachCategory, type CoachContext,
} from '../coachPrompts'

const BASE: CoachContext = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: 75,
  streakDays: 5,
  weakTopics: [{ topicId: 't1', topicName: 'Algebra', accuracy: 32 }],
  firstTopicId: 't1',
  fullName: 'Juan',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  refresh: async () => {},
  acquiredCount: 3,
  totalRequirements: 5,
  remainingRequirements: ['NSO birth cert', 'Form 138'],
  practicedToday: false,
}

describe('buildCoachPrompt', () => {
  it('returns null for weak_area when no weak topics', () => {
    const prompt = buildCoachPrompt('weak_area', { ...BASE, weakTopics: [] })
    expect(prompt).toBeNull()
  })

  it('returns null for requirements when totalRequirements is 0', () => {
    const prompt = buildCoachPrompt('requirements', { ...BASE, totalRequirements: 0 })
    expect(prompt).toBeNull()
  })

  it('returns null for daily_reminder when already practiced today', () => {
    const prompt = buildCoachPrompt('daily_reminder', { ...BASE, practicedToday: true })
    expect(prompt).toBeNull()
  })

  it('returns null for exam_countdown when daysLeft is null', () => {
    const prompt = buildCoachPrompt('exam_countdown', { ...BASE, daysLeft: null })
    expect(prompt).toBeNull()
  })

  it('returns null for streak when streakDays is 0', () => {
    const prompt = buildCoachPrompt('streak', { ...BASE, streakDays: 0 })
    expect(prompt).toBeNull()
  })

  it('uses Gemma turn tokens for valid motivation prompt', () => {
    const prompt = buildCoachPrompt('motivation', BASE)
    expect(prompt).not.toBeNull()
    expect(prompt!).toContain('<start_of_turn>user')
    expect(prompt!).toContain('Kuya Baw')
    expect(prompt!).toContain('Taglish')
    expect(prompt!).toContain('<end_of_turn>')
    expect(prompt!).toContain('<start_of_turn>model')
    expect(prompt!).not.toContain('<|im_start|>')
    expect(prompt!).not.toContain('<|im_end|>')
  })

  it('weak_area prompt references the weakest topic name + accuracy', () => {
    const prompt = buildCoachPrompt('weak_area', BASE)
    expect(prompt!).toContain('Algebra')
    expect(prompt!).toContain('32%')
  })

  it('exam_countdown tone: relaxed (>30), focused (7-30), intense (<7)', () => {
    expect(buildCoachPrompt('exam_countdown', { ...BASE, daysLeft: 60 })!).toContain('relaxed')
    expect(buildCoachPrompt('exam_countdown', { ...BASE, daysLeft: 14 })!).toContain('focused')
    expect(buildCoachPrompt('exam_countdown', { ...BASE, daysLeft: 3 })!).toContain('intense')
  })

  it('requirements prompt references acquired count and remaining names', () => {
    const prompt = buildCoachPrompt('requirements', BASE)
    expect(prompt!).toContain('3')
    expect(prompt!).toContain('5')
    expect(prompt!).toContain('NSO birth cert')
  })

  it('handles missing listing gracefully (uses fallback wording)', () => {
    const prompt = buildCoachPrompt('motivation', { ...BASE, listing: null, daysLeft: null })
    expect(prompt).not.toBeNull()
    expect(prompt!).not.toContain('null')
    expect(prompt!).not.toContain('undefined')
  })
})

describe('parseCoachPhrase', () => {
  it('returns trimmed phrase for clean text', () => {
    expect(parseCoachPhrase('Tara mag-review tayo! 💪')).toBe('Tara mag-review tayo! 💪')
  })

  it('strips surrounding quotes', () => {
    expect(parseCoachPhrase('"Tara mag-review tayo!"')).toBe('Tara mag-review tayo!')
  })

  it('strips surrounding asterisks and backticks', () => {
    expect(parseCoachPhrase('**Konting effort lang!**')).toBe('Konting effort lang!')
    expect(parseCoachPhrase('`Tara mag-review tayo!`')).toBe('Tara mag-review tayo!')
  })

  it('returns null for empty string', () => {
    expect(parseCoachPhrase('')).toBeNull()
    expect(parseCoachPhrase('   ')).toBeNull()
  })

  it('returns null for too-short string', () => {
    expect(parseCoachPhrase('Hi')).toBeNull()
  })

  it('returns null for too-long string (>280 chars)', () => {
    expect(parseCoachPhrase('x'.repeat(281))).toBeNull()
  })

  it('returns null when JSON braces leak through', () => {
    expect(parseCoachPhrase('{"phrase": "Tara mag-review!"}')).toBeNull()
  })

  it('returns null when Gemma turn tokens leak through', () => {
    expect(parseCoachPhrase('Tara mag-review! <end_of_turn>')).toBeNull()
    expect(parseCoachPhrase('<start_of_turn>model\nTara mag-review!')).toBeNull()
  })

  it('collapses whitespace runs and strips trailing newlines', () => {
    expect(parseCoachPhrase('Tara   mag-review   tayo!\n\n')).toBe('Tara mag-review tayo!')
  })
})

describe('computeContextHash', () => {
  it('produces a stable hash for identical inputs', () => {
    const a = computeContextHash(BASE)
    const b = computeContextHash({ ...BASE })
    expect(a).toBe(b)
  })

  it('changes when daysLeft changes', () => {
    const a = computeContextHash(BASE)
    const b = computeContextHash({ ...BASE, daysLeft: 25 })
    expect(a).not.toBe(b)
  })

  it('changes when listing.title changes', () => {
    const a = computeContextHash(BASE)
    const b = computeContextHash({
      ...BASE,
      listing: { title: 'DOST 2026', examDate: BASE.listing!.examDate },
    })
    expect(a).not.toBe(b)
  })

  it('changes when weakTopics[0] topicId changes', () => {
    const a = computeContextHash(BASE)
    const b = computeContextHash({ ...BASE, weakTopics: [{ topicId: 't2', topicName: 'Biology', accuracy: 50 }] })
    expect(a).not.toBe(b)
  })

  it('changes when practicedToday flips', () => {
    const a = computeContextHash(BASE)
    const b = computeContextHash({ ...BASE, practicedToday: true })
    expect(a).not.toBe(b)
  })

  it('returns a short string (<= 16 chars)', () => {
    expect(computeContextHash(BASE).length).toBeLessThanOrEqual(16)
  })
})
