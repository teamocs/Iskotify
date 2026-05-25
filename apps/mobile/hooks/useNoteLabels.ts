import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { eq, asc, and } from 'drizzle-orm'
import { useDb } from './useDb'
import { noteLabels as noteLabelsTable, noteLabelAssignments } from '../db/schema'

export interface NoteLabel {
  id: string
  name: string
  createdAt: number
}

export interface UseNoteLabels {
  labels: NoteLabel[]
  assignedLabelIds: (noteId: string) => Promise<string[]>
  createLabel: (name: string) => Promise<string>
  renameLabel: (id: string, name: string) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  assignLabel: (noteId: string, labelId: string) => Promise<void>
  unassignLabel: (noteId: string, labelId: string) => Promise<void>
}

export function makeLabelId(): string {
  return `label_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useNoteLabels(): UseNoteLabels {
  const db = useDb()
  const [labels, setLabels] = useState<NoteLabel[]>([])

  useFocusEffect(useCallback(() => {
    let cancelled = false
    void db.select().from(noteLabelsTable).orderBy(asc(noteLabelsTable.name)).then(rows => {
      if (!cancelled) setLabels(rows)
    })
    return () => { cancelled = true }
  }, [db]))

  const assignedLabelIds = useCallback(async (noteId: string): Promise<string[]> => {
    const rows = await db.select({ labelId: noteLabelAssignments.labelId })
      .from(noteLabelAssignments)
      .where(eq(noteLabelAssignments.noteId, noteId))
    return rows.map(r => r.labelId)
  }, [db])

  const createLabel = useCallback(async (name: string): Promise<string> => {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const id = makeLabelId()
    const now = Date.now()
    await db.insert(noteLabelsTable).values({ id, name: trimmed, createdAt: now })
    setLabels(prev => [...prev, { id, name: trimmed, createdAt: now }]
      .sort((a, b) => a.name.localeCompare(b.name)))
    return id
  }, [db])

  const renameLabel = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.update(noteLabelsTable).set({ name: trimmed }).where(eq(noteLabelsTable.id, id))
    setLabels(prev => prev.map(l => l.id === id ? { ...l, name: trimmed } : l)
      .sort((a, b) => a.name.localeCompare(b.name)))
  }, [db])

  const deleteLabel = useCallback(async (id: string) => {
    await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.labelId, id))
    await db.delete(noteLabelsTable).where(eq(noteLabelsTable.id, id))
    setLabels(prev => prev.filter(l => l.id !== id))
  }, [db])

  const assignLabel = useCallback(async (noteId: string, labelId: string) => {
    await db.insert(noteLabelAssignments)
      .values({ noteId, labelId })
      .onConflictDoNothing()
  }, [db])

  const unassignLabel = useCallback(async (noteId: string, labelId: string) => {
    await db.delete(noteLabelAssignments)
      .where(and(eq(noteLabelAssignments.noteId, noteId), eq(noteLabelAssignments.labelId, labelId)))
  }, [db])

  return { labels, assignedLabelIds, createLabel, renameLabel, deleteLabel, assignLabel, unassignLabel }
}
