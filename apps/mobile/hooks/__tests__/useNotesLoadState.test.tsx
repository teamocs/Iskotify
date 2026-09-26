// useNotes load state: the screens need to tell "still loading" and "the
// load failed" apart from "there are no notes" — otherwise the empty state
// ("No notes yet") flashes on every open, and a failed query is shown as an
// empty list with no way to retry.
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useNotes } from '../useNotes'

jest.mock('expo-router', () => {
  const React = require('react')
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) }
})

let mockRows: () => Promise<unknown[]>
const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({ orderBy: () => mockRows() }),
    }),
  }),
}
jest.mock('../useDb', () => ({ useDb: () => mockDb }))


const row = {
  id: 'n1', title: 'A', content: 'x', type: 'text', color: null, isPinned: false,
  isArchived: false, isTrashed: false, trashedAt: null, reminderAt: null, createdAt: 1, updatedAt: 1,
}

describe('useNotes load state', () => {
  it('is loading until the first query resolves, then exposes the rows', async () => {
    let resolve!: (rows: unknown[]) => void
    mockRows = () => new Promise(r => { resolve = r })
    const { result } = renderHook(() => useNotes('active'))
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBe(false)
    await act(async () => { resolve([row]) })
    expect(result.current.loading).toBe(false)
    expect(result.current.notes.map(n => n.id)).toEqual(['n1'])
  })

  it('reports a failed load as an error instead of an empty list, and reload retries', async () => {
    mockRows = () => Promise.reject(new Error('db closed'))
    const { result } = renderHook(() => useNotes('active'))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.loading).toBe(false)

    mockRows = () => Promise.resolve([row])
    await act(async () => { result.current.reload() })
    await waitFor(() => expect(result.current.error).toBe(false))
    expect(result.current.notes).toHaveLength(1)
  })
})
