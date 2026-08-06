import { describe, it, expect } from 'vitest'
import { flagWeakOptions } from '../flagWeakOptions'

describe('flagWeakOptions', () => {
  it('reports a well-formed option set as clean (negative case)', () => {
    const result = flagWeakOptions(['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi apparatus'])
    expect(result).toEqual({ flags: [], clean: true })
  })

  it('reports well-clustered numeric options as clean (negative case)', () => {
    const result = flagWeakOptions(['120', '135', '128', '142'])
    expect(result).toEqual({ flags: [], clean: true })
  })

  it('treats fewer than 2 non-empty options as clean — nothing to compare', () => {
    expect(flagWeakOptions(['Only one'])).toEqual({ flags: [], clean: true })
    expect(flagWeakOptions([])).toEqual({ flags: [], clean: true })
    expect(flagWeakOptions(['', '  ', 'One real option'])).toEqual({ flags: [], clean: true })
  })

  describe('length_asymmetry', () => {
    it('flags an option under 40% the length of the longest', () => {
      const result = flagWeakOptions(['Photosynthesis process', 'Sun', 'Respiration pathway', 'Digestion pathway'])
      expect(result.clean).toBe(false)
      expect(result.flags).toContain('length_asymmetry')
    })

    it('does not flag options of comparable length', () => {
      const result = flagWeakOptions(['Photosynthesis', 'Respiration', 'Fermentation', 'Transpiration'])
      expect(result.flags).not.toContain('length_asymmetry')
    })
  })

  describe('duplicate_options', () => {
    it('flags exact duplicates after case/whitespace normalization', () => {
      const result = flagWeakOptions(['Manila', 'manila ', 'Cebu', 'Davao'])
      expect(result.clean).toBe(false)
      expect(result.flags).toContain('duplicate_options')
    })

    it('flags near-duplicate options (>=80% similar)', () => {
      const result = flagWeakOptions(['Mitochondria', 'Mitochondrion', 'Ribosome', 'Nucleus'])
      expect(result.flags).toContain('duplicate_options')
    })

    it('does not flag genuinely distinct options', () => {
      const result = flagWeakOptions(['Manila', 'Cebu', 'Davao', 'Baguio'])
      expect(result.flags).not.toContain('duplicate_options')
    })
  })

  describe('none_or_all_of_above', () => {
    it('flags "all of the above"', () => {
      const result = flagWeakOptions(['12', '15', '18', 'All of the above'])
      expect(result.clean).toBe(false)
      expect(result.flags).toContain('none_or_all_of_above')
    })

    it('flags "none of the above" case-insensitively', () => {
      const result = flagWeakOptions(['Rizal', 'Bonifacio', 'Aguinaldo', 'none of the above'])
      expect(result.flags).toContain('none_or_all_of_above')
    })

    it('flags "both A and B" combining options', () => {
      const result = flagWeakOptions(['Osmosis', 'Diffusion', 'Both A and B', 'Filtration'])
      expect(result.flags).toContain('none_or_all_of_above')
    })

    it('does not flag ordinary options', () => {
      const result = flagWeakOptions(['Rizal', 'Bonifacio', 'Aguinaldo', 'Mabini'])
      expect(result.flags).not.toContain('none_or_all_of_above')
    })
  })

  describe('numeric_outlier', () => {
    // The magnitude-ratio-vs-median branch was removed (see flagWeakOptions.ts
    // doc comment) — it false-positived on ordinary geometric-progression and
    // order-of-magnitude distractor sets with no fixed threshold able to tell
    // those apart from a genuine outlier. A pure magnitude spread like
    // ['12', '15', '13', '9000'] is legitimately ambiguous (it's shaped just
    // like a valid order-of-magnitude set) and is now reported clean; the
    // mixed numeric/non-numeric branch below remains the true-positive case
    // for this rule since it's a format signal, not a magnitude guess.
    it('does not flag a pure numeric magnitude spread on its own', () => {
      const result = flagWeakOptions(['12', '15', '13', '9000'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    it('flags a single non-numeric option among numeric peers', () => {
      const result = flagWeakOptions(['10', '12', '11', 'Twelve'])
      expect(result.flags).toContain('numeric_outlier')
    })

    it('does not flag non-numeric option sets', () => {
      const result = flagWeakOptions(['Rizal', 'Bonifacio', 'Aguinaldo', 'Mabini'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    it('does not flag numeric options within a reasonable magnitude range', () => {
      const result = flagWeakOptions(['₱1,200', '₱1,350', '₱1,280', '₱1,420'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    // Wide-but-legitimate numeric spreads: geometric progressions and
    // order-of-magnitude sets are ordinary distractor patterns for exponent,
    // scientific-notation, percentage, and geometric-sequence questions on a
    // math entrance exam. A magnitude-ratio-vs-median check false-positives
    // on all of these, which floods the review queue with noise on normal
    // questions. See flagWeakOptions.ts for why the rule was narrowed.
    it('does not flag a power-of-two progression (2, 4, 8, 16)', () => {
      const result = flagWeakOptions(['2', '4', '8', '16'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    it('does not flag a power-of-five geometric progression (1, 5, 25, 125)', () => {
      const result = flagWeakOptions(['1', '5', '25', '125'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    it('does not flag a power-of-three geometric progression (3, 9, 27, 81)', () => {
      const result = flagWeakOptions(['3', '9', '27', '81'])
      expect(result.flags).not.toContain('numeric_outlier')
    })

    it('does not flag an order-of-magnitude set (0.1, 1, 10, 100)', () => {
      const result = flagWeakOptions(['0.1', '1', '10', '100'])
      expect(result.flags).not.toContain('numeric_outlier')
    })
  })
})
