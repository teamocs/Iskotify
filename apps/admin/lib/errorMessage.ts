/** A caught value's message, or `fallback` when it isn't an Error with one. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}
