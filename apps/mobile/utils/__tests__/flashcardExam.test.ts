import { pickQuestions, QUICK_SIZE, FULL_CAP } from '../flashcardExam'

const q = (id: string, question = id) => ({ id, question, options: ['a','b','c','d'], correctIndex: 0 }) as any

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
  it('drops in-session duplicates by normalized question text', () => {
    const items = [q('a','What is 2+2?'), q('b','what is 2+2? '), q('c','Other')]
    const out = pickQuestions(items, 'full')
    expect(out.length).toBe(2)
  })
})
