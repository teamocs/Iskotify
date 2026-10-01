// A blueprint's total_items is DERIVED from its sections, never typed by hand:
// the mobile runner sizes its timers and prestart figures from the sections, so a
// hand-entered total that drifts (DOST-SEI shipped total_items 170 over sections
// summing to 210) only creates a second, wrong number. Shared by the editor (read-only
// display + payload) and the save API (authoritative value written to the row).

/** One section's item count as stored: a non-negative whole number, 0 for blank/garbage. */
export function sectionItemCount(value: unknown): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Sum of the sections' item counts. */
export function sumSectionItems(sections: readonly { item_count?: unknown }[]): number {
  return sections.reduce((total, s) => total + sectionItemCount(s.item_count), 0)
}
