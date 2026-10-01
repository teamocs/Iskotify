import { describe, it, expect } from 'vitest'
import { sumSectionItems } from '../blueprintTotals'

describe('sumSectionItems', () => {
  it('adds the sections’ item counts', () => {
    expect(sumSectionItems([{ item_count: 60 }, { item_count: 45 }, { item_count: 105 }])).toBe(210)
  })
  it('treats blank, negative and non-numeric counts as 0 (same coercion the save applies)', () => {
    expect(sumSectionItems([{ item_count: '' }, { item_count: 'abc' }, { item_count: -5 }, { item_count: '12' }])).toBe(12)
  })
  it('is 0 for no sections', () => {
    expect(sumSectionItems([])).toBe(0)
  })
})
