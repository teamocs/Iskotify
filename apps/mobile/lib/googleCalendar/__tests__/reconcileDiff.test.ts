import { reconcileDiff } from '../reconcileDiff'

const now = new Date(2026, 10, 16, 9).getTime()
const future = new Date(2026, 10, 20, 12).getTime()
const past = new Date(2026, 10, 10, 12).getTime()

describe('reconcileDiff', () => {
  it('creates events for future reminders with no googleEventId', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: future, googleEventId: null }], now)
    expect(out.toCreate.map(n => n.id)).toEqual(['n1'])
    expect(out.toUpdate).toEqual([])
    expect(out.toDelete).toEqual([])
  })

  it('ignores already-synced future reminders (no-op)', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: future, googleEventId: 'evt_1' }], now)
    expect(out.toCreate).toEqual([])
    expect(out.toUpdate).toEqual([])
    expect(out.toDelete).toEqual([])
  })

  it('ignores past reminders that were never synced', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: past, googleEventId: null }], now)
    expect(out.toCreate).toEqual([])
  })

  it('deletes synced events whose reminder is now in the past', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: past, googleEventId: 'evt_1' }], now)
    expect(out.toDelete.map(n => n.googleEventId)).toEqual(['evt_1'])
  })

  it('ignores reminders with null reminderAt', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: null, googleEventId: null }], now)
    expect(out.toCreate).toEqual([])
    expect(out.toDelete).toEqual([])
  })
})
