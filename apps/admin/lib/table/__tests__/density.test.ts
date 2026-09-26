import { describe, it, expect, vi } from 'vitest'
import { DENSITY_KEY, createDensityStore, readDensity, writeDensity } from '../density'

/** A minimal in-memory Storage. */
function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    data,
  }
}

const throwing = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceeded') },
}

describe('table density preference', () => {
  it('defaults to comfortable when nothing is stored', () => {
    expect(readDensity(memoryStorage())).toBe('comfortable')
    expect(readDensity(null)).toBe('comfortable')
  })

  it('reads a stored compact preference', () => {
    expect(readDensity(memoryStorage({ [DENSITY_KEY]: 'compact' }))).toBe('compact')
  })

  it('ignores an unknown stored value', () => {
    expect(readDensity(memoryStorage({ [DENSITY_KEY]: 'cosy' }))).toBe('comfortable')
  })

  it('survives storage that throws (private mode, blocked site data)', () => {
    expect(readDensity(throwing)).toBe('comfortable')
    expect(() => writeDensity(throwing, 'compact')).not.toThrow()
  })

  it('writes the preference under one console-wide key', () => {
    const s = memoryStorage()
    writeDensity(s, 'compact')
    expect(s.data.get(DENSITY_KEY)).toBe('compact')
  })
})

describe('density store', () => {
  it('persists a change so the next page load starts compact', () => {
    const storage = memoryStorage()
    const store = createDensityStore(() => storage)
    expect(store.getSnapshot()).toBe('comfortable')
    store.set('compact')
    expect(store.getSnapshot()).toBe('compact')
    // A fresh store over the same storage = a reload.
    expect(createDensityStore(() => storage).getSnapshot()).toBe('compact')
  })

  it('notifies subscribers, and stops after unsubscribe', () => {
    const store = createDensityStore(() => memoryStorage())
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set('compact')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set('comfortable')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('renders comfortable on the server, whatever is stored', () => {
    const store = createDensityStore(() => memoryStorage({ [DENSITY_KEY]: 'compact' }))
    expect(store.getServerSnapshot()).toBe('comfortable')
  })
})
