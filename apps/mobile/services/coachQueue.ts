import { eq, and, asc, lt, ne } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { coachPhrases, userRequirements } from '../db/schema'
import type { CoachCategory } from './coachPrompts'

export interface QueuedPhrase {
  id: number
  category: CoachCategory
  text: string
  generatedAt: number
  contextHash: string
  consumed: boolean
}

export async function loadFreshPhrases(
  db: DrizzleClient,
  contextHash: string,
): Promise<QueuedPhrase[]> {
  const rows = await db
    .select()
    .from(coachPhrases)
    .where(and(
      eq(coachPhrases.consumed, false),
      eq(coachPhrases.contextHash, contextHash),
    ))
    .orderBy(asc(coachPhrases.generatedAt))
  return rows.map(r => ({
    id: r.id,
    category: r.category as CoachCategory,
    text: r.text,
    generatedAt: r.generatedAt,
    contextHash: r.contextHash,
    consumed: r.consumed,
  }))
}

export async function pruneStalePhrases(
  db: DrizzleClient,
  contextHash: string,
): Promise<void> {
  await db
    .delete(coachPhrases)
    .where(and(
      eq(coachPhrases.consumed, false),
      ne(coachPhrases.contextHash, contextHash),
    ))
}

export async function insertPhrase(
  db: DrizzleClient,
  category: CoachCategory,
  text: string,
  contextHash: string,
): Promise<void> {
  await db.insert(coachPhrases).values({
    category,
    text,
    generatedAt: Date.now(),
    contextHash,
    consumed: false,
  })
}

export async function markConsumed(
  db: DrizzleClient,
  id: number,
): Promise<void> {
  await db
    .update(coachPhrases)
    .set({ consumed: true })
    .where(eq(coachPhrases.id, id))
}

export async function gcOldConsumed(
  db: DrizzleClient,
  olderThanMs: number,
): Promise<void> {
  const cutoff = Date.now() - olderThanMs
  await db
    .delete(coachPhrases)
    .where(and(
      eq(coachPhrases.consumed, true),
      lt(coachPhrases.generatedAt, cutoff),
    ))
}

// ── Requirements ─────────────────────────────────────────────────────────────

export async function getAcquiredRequirementIndices(
  db: DrizzleClient,
  listingSlug: string,
): Promise<number[]> {
  const rows = await db
    .select({ idx: userRequirements.requirementIndex })
    .from(userRequirements)
    .where(eq(userRequirements.listingSlug, listingSlug))
  return rows.map(r => r.idx)
}

export async function toggleRequirement(
  db: DrizzleClient,
  listingSlug: string,
  requirementIndex: number,
  acquired: boolean,
): Promise<void> {
  if (acquired) {
    await db
      .insert(userRequirements)
      .values({ listingSlug, requirementIndex, acquiredAt: Date.now() })
      .onConflictDoNothing()
  } else {
    await db
      .delete(userRequirements)
      .where(and(
        eq(userRequirements.listingSlug, listingSlug),
        eq(userRequirements.requirementIndex, requirementIndex),
      ))
  }
}
