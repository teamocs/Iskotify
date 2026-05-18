import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { savedDecks as savedDecksTable } from '../db/schema'
import { eq } from 'drizzle-orm'

export interface SavedDeck {
  id: string
  name: string
  topicIds: string[]
  createdAt: number
}

export interface UseSavedDecks {
  decks: SavedDeck[]
  createDeck: (name: string, topicIds: string[]) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function parseTopicIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(x => typeof x === 'string')
    return []
  } catch {
    return []
  }
}

export function makeDeckId(): string {
  return `deck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useSavedDecks(): UseSavedDecks {
  const db = useDb()
  const [decks, setDecks] = useState<SavedDeck[]>([])

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      const rows = await db.select().from(savedDecksTable).orderBy(savedDecksTable.createdAt)
      if (!cancelled) {
        setDecks(rows.map(r => ({
          id: r.id,
          name: r.name,
          topicIds: parseTopicIds(r.topicIds),
          createdAt: r.createdAt,
        })))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db]))

  const createDeck = useCallback(async (name: string, topicIds: string[]) => {
    const trimmed = name.trim()
    if (!trimmed || topicIds.length === 0) return
    await db.insert(savedDecksTable).values({
      id: makeDeckId(),
      name: trimmed,
      topicIds: JSON.stringify(topicIds),
      createdAt: Date.now(),
    })
    const rows = await db.select().from(savedDecksTable).orderBy(savedDecksTable.createdAt)
    setDecks(rows.map(r => ({
      id: r.id,
      name: r.name,
      topicIds: parseTopicIds(r.topicIds),
      createdAt: r.createdAt,
    })))
  }, [db])

  const deleteDeck = useCallback(async (id: string) => {
    await db.delete(savedDecksTable).where(eq(savedDecksTable.id, id))
    setDecks(prev => prev.filter(d => d.id !== id))
  }, [db])

  return { decks, createDeck, deleteDeck }
}
