/**
 * A to-one embedded relation from a Supabase select (`flashcard_topics(name)`).
 * PostgREST returns an object, while the untyped client infers an array; accept both.
 */
export function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
