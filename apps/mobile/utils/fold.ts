/**
 * Search folding: strip diacritics and lowercase, so "Dasmariñas" matches
 * "dasmarinas" and "Cañete" matches "canete" (both directions). Apply it to
 * the query AND to every haystack before comparing.
 */
export function fold(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
