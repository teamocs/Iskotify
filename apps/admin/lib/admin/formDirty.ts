/** Stable JSON: object keys sorted, so key order never makes a form look edited. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
      : v,
  )
}

/** A form has unsaved edits when its current values differ from the ones it opened with. */
export function isDirty(current: object, initial: object): boolean {
  return stable(current) !== stable(initial)
}
