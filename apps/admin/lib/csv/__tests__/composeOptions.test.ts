import { describe, it, expect } from 'vitest'
import { composeOptions } from '../composeOptions'

describe('composeOptions', () => {
  it('returns 4 options with the correct index pointing to answer', () => {
    const { options, correctIndex } = composeOptions('4', ['3', '5', '6'], 'q-seed')
    expect(options).toHaveLength(4)
    expect(options).toContain('4')
    expect(options).toContain('3')
    expect(options).toContain('5')
    expect(options).toContain('6')
    expect(options[correctIndex]).toBe('4')
  })

  it('throws when distractors length is not exactly 3', () => {
    expect(() => composeOptions('4', ['3', '5'], 'q')).toThrow()
    expect(() => composeOptions('4', ['3', '5', '6', '7'], 'q')).toThrow()
    expect(() => composeOptions('4', [], 'q')).toThrow()
  })

  it('is deterministic — same inputs produce same shuffle', () => {
    const a = composeOptions('Manila', ['Cebu', 'Davao', 'Quezon City'], 'capital-of-ph')
    const b = composeOptions('Manila', ['Cebu', 'Davao', 'Quezon City'], 'capital-of-ph')
    expect(a.options).toEqual(b.options)
    expect(a.correctIndex).toBe(b.correctIndex)
  })

  it('different seeds produce different shuffles (most of the time)', () => {
    const a = composeOptions('4', ['3', '5', '6'], 'seed-A')
    const b = composeOptions('4', ['3', '5', '6'], 'seed-B-distinct')
    // Not always different — but for THESE specific seeds we picked, they should differ
    expect(a.options).not.toEqual(b.options)
  })
})
