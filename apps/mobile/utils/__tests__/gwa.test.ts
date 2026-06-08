import { computeGwa, latinHonor, hasDisqualifyingGrade, isValidGrade, totalUnits } from '../gwa'

describe('computeGwa', () => {
  it('computes a units-weighted average', () => {
    // (1.0*3 + 2.0*3) / 6 = 1.5
    expect(computeGwa([{ grade: 1.0, units: 3 }, { grade: 2.0, units: 3 }])).toBe(1.5)
  })
  it('weights by units, not a plain mean', () => {
    // (1.0*5 + 3.0*1) / 6 = 8/6 = 1.3333
    expect(computeGwa([{ grade: 1.0, units: 5 }, { grade: 3.0, units: 1 }])).toBe(1.3333)
  })
  it('ignores invalid grades and non-positive units', () => {
    expect(computeGwa([
      { grade: 1.25, units: 3 },
      { grade: 6.0, units: 3 },   // out of range
      { grade: 1.5, units: 0 },   // zero units
      { grade: NaN, units: 3 },   // not finite
    ])).toBe(1.25)
  })
  it('returns null when nothing is valid', () => {
    expect(computeGwa([])).toBeNull()
    expect(computeGwa([{ grade: 0.5, units: 3 }, { grade: 2, units: -1 }])).toBeNull()
  })
  it('rounds to 4 decimal places', () => {
    // (1.0*1 + 2.0*1 + 3.0*1)/3 = 2.0
    expect(computeGwa([{ grade: 1, units: 1 }, { grade: 2, units: 1 }, { grade: 3, units: 1 }])).toBe(2)
  })
})

describe('isValidGrade', () => {
  it('accepts UP-scale grades', () => {
    expect(isValidGrade(1.0)).toBe(true)
    expect(isValidGrade(5.0)).toBe(true)
    expect(isValidGrade(2.75)).toBe(true)
  })
  it('rejects out-of-range / non-finite', () => {
    expect(isValidGrade(0.99)).toBe(false)
    expect(isValidGrade(5.01)).toBe(false)
    expect(isValidGrade(NaN)).toBe(false)
  })
})

describe('totalUnits', () => {
  it('sums units of valid rows only', () => {
    expect(totalUnits([{ grade: 1, units: 3 }, { grade: 9, units: 5 }, { grade: 2, units: 2 }])).toBe(5)
  })
})

describe('latinHonor', () => {
  it('maps GWA to the correct honor band', () => {
    expect(latinHonor(1.0)).toBe('Summa Cum Laude')
    expect(latinHonor(1.2)).toBe('Summa Cum Laude')
    expect(latinHonor(1.21)).toBe('Magna Cum Laude')
    expect(latinHonor(1.45)).toBe('Magna Cum Laude')
    expect(latinHonor(1.46)).toBe('Cum Laude')
    expect(latinHonor(1.75)).toBe('Cum Laude')
    expect(latinHonor(1.76)).toBeNull()
  })
  it('returns null for null gwa or a disqualifying grade', () => {
    expect(latinHonor(null)).toBeNull()
    expect(latinHonor(1.0, true)).toBeNull()
  })
})

describe('hasDisqualifyingGrade', () => {
  it('flags any grade below the 3.00 passing line', () => {
    expect(hasDisqualifyingGrade([{ grade: 1.0, units: 3 }, { grade: 4.0, units: 3 }])).toBe(true)
    expect(hasDisqualifyingGrade([{ grade: 1.0, units: 3 }, { grade: 3.0, units: 3 }])).toBe(false)
  })
})
