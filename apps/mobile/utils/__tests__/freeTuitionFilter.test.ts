import { passesFreeTuitionFilter } from '../freeTuitionFilter'

describe('passesFreeTuitionFilter', () => {
  it('passes when the profile explicitly marks free tuition', () => {
    expect(passesFreeTuitionFilter({ isSuc: false, isLuc: false }, true)).toBe(true)
  })

  it('passes SUC schools even with no profile (freeTuition null) — RA 10931', () => {
    expect(passesFreeTuitionFilter({ isSuc: true, isLuc: false }, null)).toBe(true)
  })

  it('passes LUC schools even with no profile (freeTuition null) — RA 10931', () => {
    expect(passesFreeTuitionFilter({ isSuc: false, isLuc: true }, null)).toBe(true)
  })

  it('does NOT drop the profile-less school just because freeTuition is null — SUC/LUC flags still count', () => {
    expect(passesFreeTuitionFilter({ isSuc: true, isLuc: false }, undefined as unknown as null)).toBe(true)
  })

  it('fails a private, non-SUC/LUC school with no free-tuition profile flag', () => {
    expect(passesFreeTuitionFilter({ isSuc: false, isLuc: false }, null)).toBe(false)
  })

  it('fails a private school whose profile explicitly marks freeTuition false', () => {
    expect(passesFreeTuitionFilter({ isSuc: false, isLuc: false }, false)).toBe(false)
  })

  it('passes when freeTuition is explicitly true even for a private school', () => {
    expect(passesFreeTuitionFilter({ isSuc: false, isLuc: false }, true)).toBe(true)
  })
})
