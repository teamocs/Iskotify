import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { eq, asc } from 'drizzle-orm'
import { useDb } from './useDb'
import { focusListings, listings } from '../db/schema'
import { syncOnLaunch, pushUserData } from '../services/sync'
import { invalidate } from '../services/queryCache'
import { scheduleWebPersist } from '../db/webPersist'
import { capture } from '../lib/analytics'

export interface FocusListing {
  slug: string
  priority: number
  addedAt: number
  title: string
  type: string
}

export function normalizePriorities(rows: FocusListing[]): FocusListing[] {
  return [...rows]
    .sort((a, b) => a.priority - b.priority)
    .map((r, i) => ({ ...r, priority: i + 1 }))
}

export function swapPriority(rows: FocusListing[], slug: string, direction: 'up' | 'down'): FocusListing[] {
  const idx = rows.findIndex(r => r.slug === slug)
  if (idx === -1) return rows
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return rows
  const next = rows.map(r => ({ ...r }))
  const tmp = next[idx]!.priority
  next[idx]!.priority = next[swapIdx]!.priority
  next[swapIdx]!.priority = tmp
  return normalizePriorities(next)
}

export function useFocusListings() {
  const db = useDb()
  const [focusListingsList, setFocusListingsList] = useState<FocusListing[]>([])

  const load = useCallback(async () => {
    const rows = await db
      .select({
        slug: focusListings.listingSlug,
        priority: focusListings.priority,
        addedAt: focusListings.addedAt,
        title: listings.title,
        type: listings.type,
      })
      .from(focusListings)
      .leftJoin(listings, eq(listings.slug, focusListings.listingSlug))
      .orderBy(asc(focusListings.priority))
    setFocusListingsList(rows.map(r => ({
      slug: r.slug,
      priority: r.priority,
      addedAt: r.addedAt,
      title: r.title ?? r.slug,
      type: r.type ?? 'exam',
    })))
  }, [db])

  const refresh = useCallback(async () => {
    // Pull fresh listings from Supabase; syncOnLaunch handles offline via try/catch internally
    await syncOnLaunch(db)
    // Then re-read local DB to surface the new rows
    await load()
  }, [db, load])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function addListing(slug: string) {
    const maxPriority = focusListingsList.reduce((m, r) => r.priority > m ? r.priority : m, 0)
    await db.insert(focusListings)
      .values({ listingSlug: slug, priority: maxPriority + 1, addedAt: Date.now() })
      .onConflictDoNothing()
    capture('focus_added', { slug, priority: maxPriority + 1 })
    scheduleWebPersist()
    invalidate('home:')
    invalidate('practice:')
    invalidate('chat:')
    await load()
    void pushUserData(db).catch(() => { /* best-effort backup */ })
  }

  async function removeListing(slug: string) {
    await db.delete(focusListings).where(eq(focusListings.listingSlug, slug))
    capture('focus_removed', { slug })
    const remaining = focusListingsList.filter(r => r.slug !== slug)
    const normalized = normalizePriorities(remaining)
    await db.transaction(tx => {
      for (const r of normalized) {
        tx.update(focusListings).set({ priority: r.priority }).where(eq(focusListings.listingSlug, r.slug)).run()
      }
    })
    scheduleWebPersist()
    invalidate('home:')
    invalidate('practice:')
    invalidate('chat:')
    await load()
    void pushUserData(db).catch(() => { /* best-effort backup */ })
  }

  async function moveListing(slug: string, direction: 'up' | 'down') {
    const updated = swapPriority(focusListingsList, slug, direction)
    await db.transaction(tx => {
      for (const r of updated) {
        tx.update(focusListings).set({ priority: r.priority }).where(eq(focusListings.listingSlug, r.slug)).run()
      }
    })
    setFocusListingsList(updated)
  }

  function isInFocus(slug: string): boolean {
    return focusListingsList.some(r => r.slug === slug)
  }

  function getPriority(slug: string): number | null {
    return focusListingsList.find(r => r.slug === slug)?.priority ?? null
  }

  return { focusListings: focusListingsList, addListing, removeListing, moveListing, isInFocus, getPriority, refresh }
}
