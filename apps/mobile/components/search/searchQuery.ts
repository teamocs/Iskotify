import { useCallback, useSyncExternalStore } from 'react'

// The Search tab's query, shared by the screen and the bar's bottom search
// field (the floating bar hosts the field on phones and tablets). A tiny
// external store: one value, one set of listeners, nothing persisted.

let query = ''
const listeners = new Set<() => void>()

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const get = () => query

export function setSearchQuery(next: string): void {
  if (next === query) return
  query = next
  listeners.forEach(l => l())
}

/** [query, setQuery] — like useState, shared across the app. */
export function useSearchQuery(): [string, (q: string) => void] {
  const q = useSyncExternalStore(subscribe, get, get)
  const set = useCallback((next: string) => setSearchQuery(next), [])
  return [q, set]
}

// The keyboard's search key in the bar's field: the screen records a recent.
const submitListeners = new Set<(q: string) => void>()

export function submitSearchQuery(): void {
  submitListeners.forEach(l => l(query))
}

/** Run `cb` when the bar's field is submitted. */
export function subscribeSearchSubmit(cb: (q: string) => void): () => void {
  submitListeners.add(cb)
  return () => { submitListeners.delete(cb) }
}

/** Test-only. */
export function __resetSearchQueryForTests(): void {
  query = ''
  listeners.clear()
  submitListeners.clear()
}
