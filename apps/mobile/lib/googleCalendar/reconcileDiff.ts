export interface ReconcileNote {
  id: string
  reminderAt: number | null
  googleEventId: string | null
}

export interface ReconcileResult {
  toCreate: ReconcileNote[]
  toUpdate: ReconcileNote[]   // reserved for future edit-detection; empty in v1 reconcile
  toDelete: ReconcileNote[]
}

/**
 * Given local reminder rows and the current time, decide what Calendar work the
 * reconcile pass should do. v1 rule set:
 *  - future reminder + no event  → create
 *  - past reminder + has event   → delete (clean up stale events)
 *  - everything else             → leave alone
 * Edits are mirrored at the action site (not here), so toUpdate stays empty in v1.
 */
export function reconcileDiff(notes: ReconcileNote[], nowMs: number): ReconcileResult {
  const toCreate: ReconcileNote[] = []
  const toDelete: ReconcileNote[] = []
  for (const n of notes) {
    if (n.reminderAt == null) continue
    const isFuture = n.reminderAt >= nowMs
    if (isFuture && !n.googleEventId) toCreate.push(n)
    else if (!isFuture && n.googleEventId) toDelete.push(n)
  }
  return { toCreate, toUpdate: [], toDelete }
}
