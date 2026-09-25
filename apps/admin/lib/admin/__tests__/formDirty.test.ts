import { describe, it, expect } from 'vitest'
import { isDirty } from '../formDirty'

describe('isDirty', () => {
  it('is false when the values match the initial values', () => {
    expect(isDirty({ a: '1', b: false }, { a: '1', b: false })).toBe(false)
  })

  it('is true once any value differs', () => {
    expect(isDirty({ a: '2', b: false }, { a: '1', b: false })).toBe(true)
    expect(isDirty({ a: '1', b: true }, { a: '1', b: false })).toBe(true)
  })

  it('ignores key order', () => {
    expect(isDirty({ b: 1, a: 2 }, { a: 2, b: 1 })).toBe(false)
  })
})
