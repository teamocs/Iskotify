import { describe, it, expect } from 'vitest'
import { parseLegacyEmbeddedMcq } from '../legacyMcq'

describe('parseLegacyEmbeddedMcq', () => {
  it('parses A./B./C./D. newline format', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'Which organelle produces ATP?\nA. Nucleus\nB. Ribosome\nC. Mitochondria\nD. Chloroplast',
      answer: 'C. Mitochondria',
    })
    expect(result).not.toBeNull()
    expect(result!.stem).toBe('Which organelle produces ATP?')
    expect(result!.options).toEqual(['Nucleus', 'Ribosome', 'Mitochondria', 'Chloroplast'])
    expect(result!.correctIndex).toBe(2)
  })

  it('parses A)/B)/C)/D) inline format', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'What is 2+2? A) 2 B) 3 C) 4 D) 5',
      answer: 'C) 4',
    })
    expect(result).not.toBeNull()
    expect(result!.stem).toBe('What is 2+2?')
    expect(result!.options).toEqual(['2', '3', '4', '5'])
    expect(result!.correctIndex).toBe(2)
  })

  it('returns null when question lacks A./B./C./D. markers', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'What is the capital of France?',
      answer: 'Paris',
    })
    expect(result).toBeNull()
  })

  it('returns null when answer column lacks letter prefix', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'Which is correct?\nA. A1\nB. B1\nC. C1\nD. D1',
      answer: 'Just text, no letter prefix',
    })
    expect(result).toBeNull()
  })

  it('returns null when parsed options do not include the answer', () => {
    // Edge case: malformed legacy row where answer column doesn't match
    // any of the parsed options (typo in either field)
    const result = parseLegacyEmbeddedMcq({
      question: 'Q?\nA. X\nB. Y\nC. Z\nD. W',
      answer: 'C. Mitochondria',
    })
    // Letter C points to option index 2 which is "Z", not "Mitochondria".
    // We can't trust this row — return null so caller logs it for review.
    expect(result).toBeNull()
  })

  it('handles answer A (index 0)', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'First letter?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta',
      answer: 'A. Alpha',
    })
    expect(result!.correctIndex).toBe(0)
  })

  it('handles answer D (index 3)', () => {
    const result = parseLegacyEmbeddedMcq({
      question: 'Last?\nA. One\nB. Two\nC. Three\nD. Four',
      answer: 'D. Four',
    })
    expect(result!.correctIndex).toBe(3)
  })
})
