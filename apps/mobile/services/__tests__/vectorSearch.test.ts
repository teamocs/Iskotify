import {
  cosineSimilarity,
  int8Quantize,
  int8Dequantize,
  cosineTopK,
  reciprocalRankFusion,
} from '../vectorSearch'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 6)
  })

  it('is scale-invariant', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6)
  })

  it('accepts Float32Array inputs', () => {
    const a = Float32Array.from([1, 0, 0])
    const b = Float32Array.from([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6)
  })

  it('returns 0 when either vector is empty', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0)
    expect(cosineSimilarity([1, 2], [])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 when either vector has zero norm', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0)
  })
})

describe('int8Quantize / int8Dequantize', () => {
  it('quantizes with symmetric max-abs scaling (scale = maxAbs/127)', () => {
    const { q, scale } = int8Quantize([0, 1, -1, 0.5])
    expect(scale).toBeCloseTo(1 / 127, 8)
    expect(q[0]).toBe(0)
    expect(q[1]).toBe(127)
    expect(q[2]).toBe(-127)
    expect(q[3]).toBe(Math.round(0.5 / scale))
  })

  it('produces a zero-scale, all-zero quantization for a zero vector', () => {
    const { q, scale } = int8Quantize([0, 0, 0])
    expect(scale).toBe(0)
    expect(Array.from(q)).toEqual([0, 0, 0])
    // Dequantize of a zero-scale vector is all zeros (no NaN)
    expect(Array.from(int8Dequantize(q, scale))).toEqual([0, 0, 0])
  })

  it('round-trips to > 0.99 cosine similarity for a fixed random-ish vector', () => {
    const original = Float32Array.from([
      0.12, -0.98, 0.44, 0.03, -0.71, 0.56, 0.89, -0.22,
      0.34, -0.11, 0.77, -0.65, 0.09, 0.48, -0.53, 0.19,
    ])
    const { q, scale } = int8Quantize(original)
    const restored = int8Dequantize(q, scale)
    expect(cosineSimilarity(original, restored)).toBeGreaterThan(0.99)
  })

  it('dequantize reverses quantize approximately', () => {
    const original = [2, -4, 6, -8]
    const { q, scale } = int8Quantize(original)
    const restored = int8Dequantize(q, scale)
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 1)
    }
  })
})

describe('cosineTopK', () => {
  const corpus = [
    { id: 'a', vec: [1, 0, 0] },
    { id: 'b', vec: [0, 1, 0] },
    { id: 'c', vec: [0.9, 0.1, 0] },
    { id: 'd', vec: [0, 0, 1] },
  ]

  it('returns the k highest-scoring ids sorted descending', () => {
    const result = cosineTopK([1, 0, 0], corpus, 2)
    expect(result.map(r => r.id)).toEqual(['a', 'c'])
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score)
  })

  it('caps length at min(k, corpus.length)', () => {
    expect(cosineTopK([1, 0, 0], corpus, 10)).toHaveLength(4)
    expect(cosineTopK([1, 0, 0], corpus, 1)).toHaveLength(1)
  })

  it('returns empty array for empty corpus or k <= 0', () => {
    expect(cosineTopK([1, 0, 0], [], 5)).toEqual([])
    expect(cosineTopK([1, 0, 0], corpus, 0)).toEqual([])
  })

  it('is stable for equal scores (preserves corpus order)', () => {
    const tied = [
      { id: 'x', vec: [1, 0] },
      { id: 'y', vec: [1, 0] },
      { id: 'z', vec: [1, 0] },
    ]
    const result = cosineTopK([1, 0], tied, 3)
    expect(result.map(r => r.id)).toEqual(['x', 'y', 'z'])
  })
})

describe('reciprocalRankFusion', () => {
  it('fuses lists with default k=60 using 1-based ranks', () => {
    const result = reciprocalRankFusion([['a', 'b'], ['a', 'c']])
    // a is rank 1 in both: 1/61 + 1/61
    const a = result.find(r => r.id === 'a')!
    expect(a.score).toBeCloseTo(1 / 61 + 1 / 61, 8)
  })

  it('ranks an id that is #1 in both lists above an id that is #1 in only one', () => {
    const result = reciprocalRankFusion([['a', 'x'], ['a', 'y']])
    expect(result[0]!.id).toBe('a')
    // a beats both x (rank 2 in list 0) and y (rank 2 in list 1)
    const ids = result.map(r => r.id)
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('x'))
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('y'))
  })

  it('includes ids that appear in only one list', () => {
    const result = reciprocalRankFusion([['a'], ['b']])
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b'])
  })

  it('respects a custom k', () => {
    const result = reciprocalRankFusion([['a']], 1)
    // rank 1, k=1 → 1/(1+1) = 0.5
    expect(result[0]!.score).toBeCloseTo(0.5, 8)
  })

  it('returns empty array for empty input', () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it('sorts by fused score descending', () => {
    const result = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'a', 'c']])
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score)
    }
  })
})
