import { pickQuestions, QUICK_SIZE, FULL_CAP } from '../flashcardExam'

const q = (id: string, stem = id) => ({ id, stem, options: ['a','b','c','d'], answerIndex: 0 }) as any

describe('pickQuestions', () => {
  it('full mode returns all up to FULL_CAP, order preserved', () => {
    const items = Array.from({ length: 10 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'full').map(x => x.id)).toEqual(items.map(x => x.id))
  })
  it('full mode caps at FULL_CAP', () => {
    const items = Array.from({ length: FULL_CAP + 20 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'full').length).toBe(FULL_CAP)
  })
  it('quick mode returns at most QUICK_SIZE', () => {
    const items = Array.from({ length: 100 }, (_, i) => q('c'+i))
    const out = pickQuestions(items, 'quick')
    expect(out.length).toBe(QUICK_SIZE)
    expect(out.length).toBeGreaterThan(0)
  })
  it('quick mode returns all when fewer than QUICK_SIZE', () => {
    const items = Array.from({ length: 5 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'quick').length).toBe(5)
  })
  it('drops in-session duplicates by normalized stem text', () => {
    const items = [q('a','What is 2+2?'), q('b','what is 2+2? '), q('c','Other')]
    const out = pickQuestions(items, 'full')
    expect(out.length).toBe(2)
  })

  describe('due mode (Task H)', () => {
    it('keeps only items present in dueAtById, ordering most-overdue (smallest dueAt) first', () => {
      const items = [q('a'), q('b'), q('c'), q('d')]
      const dueAtById = { c: 100, a: 300 } // b, d not due
      const out = pickQuestions(items, 'due', dueAtById)
      expect(out.map(x => x.id)).toEqual(['c', 'a'])
    })

    it('returns an empty array when dueAtById is missing or empty (never falls back to "all")', () => {
      const items = [q('a'), q('b')]
      expect(pickQuestions(items, 'due')).toEqual([])
      expect(pickQuestions(items, 'due', {})).toEqual([])
    })

    it('drops items with no id even if dueAtById happens to have a matching key', () => {
      const items = [{ stem: 'no id', options: [], answerIndex: 0 } as any]
      expect(pickQuestions(items, 'due', { undefined: 1 } as any)).toEqual([])
    })

    it('caps at FULL_CAP', () => {
      const items = Array.from({ length: FULL_CAP + 20 }, (_, i) => q('c'+i))
      const dueAtById = Object.fromEntries(items.map((it, i) => [it.id, i]))
      expect(pickQuestions(items, 'due', dueAtById).length).toBe(FULL_CAP)
    })

    it('deduplicates by stem before filtering to due', () => {
      const items = [q('a','What is 2+2?'), q('b','what is 2+2? ')]
      const dueAtById = { a: 1, b: 2 }
      // 'b' is deduped away (normalized stem collides with 'a'), so only 'a' remains due.
      expect(pickQuestions(items, 'due', dueAtById).map(x => x.id)).toEqual(['a'])
    })
  })
})
