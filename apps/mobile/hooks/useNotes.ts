import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { desc, and, eq, lt } from 'drizzle-orm'
import { useDb } from './useDb'
import { notes as notesTable, noteLabelAssignments } from '../db/schema'

export type NoteType = 'text' | 'checklist'
export type NoteColor =
  | 'red' | 'pink' | 'orange' | 'yellow' | 'teal' | 'green'
  | 'cyan' | 'blue' | 'cerulean' | 'purple' | 'gray' | null

export interface ChecklistItem {
  id: string
  text: string
  isChecked: boolean
}

export interface Note {
  id: string
  title: string
  content: string
  type: NoteType
  color: NoteColor
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
  trashedAt: number | null
  createdAt: number
  updatedAt: number
}

export const NOTE_COLORS: Record<string, string> = {
  red: '#F28B82',
  pink: '#F6C0C0',
  orange: '#FBBC04',
  yellow: '#FFF475',
  teal: '#CCFF90',
  green: '#E6F4EA',
  cyan: '#D3F0F4',
  blue: '#AECBFA',
  cerulean: '#D4E6F1',
  purple: '#E8CEFC',
  gray: '#E8EAED',
}

export function makeNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function parseChecklistItems(content: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ChecklistItem =>
      item != null &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.text === 'string' &&
      typeof item.isChecked === 'boolean'
    )
  } catch {
    return []
  }
}

function mapRow(r: typeof notesTable.$inferSelect): Note {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type as NoteType,
    color: (r.color as NoteColor) ?? null,
    isPinned: Boolean(r.isPinned),
    isArchived: Boolean(r.isArchived),
    isTrashed: Boolean(r.isTrashed),
    trashedAt: r.trashedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export interface UseNotes {
  notes: Note[]
  createNote: (type: NoteType) => Promise<string>
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'isPinned'>>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  unarchiveNote: (id: string) => Promise<void>
  restoreNote: (id: string) => Promise<void>
  permanentlyDeleteNote: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  pruneOldTrashedNotes: () => Promise<void>
}

export function useNotes(filter: 'active' | 'archived' | 'trashed' = 'active'): UseNotes {
  const db = useDb()
  const [notesList, setNotesList] = useState<Note[]>([])

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      let rows: (typeof notesTable.$inferSelect)[]
      if (filter === 'active') {
        rows = await db.select().from(notesTable)
          .where(and(eq(notesTable.isArchived, false), eq(notesTable.isTrashed, false)))
          .orderBy(desc(notesTable.isPinned), desc(notesTable.updatedAt))
      } else if (filter === 'archived') {
        rows = await db.select().from(notesTable)
          .where(and(eq(notesTable.isArchived, true), eq(notesTable.isTrashed, false)))
          .orderBy(desc(notesTable.updatedAt))
      } else {
        rows = await db.select().from(notesTable)
          .where(eq(notesTable.isTrashed, true))
          .orderBy(desc(notesTable.updatedAt))
      }
      if (!cancelled) setNotesList(rows.map(mapRow))
    }
    void load()
    return () => { cancelled = true }
  }, [db, filter]))

  const createNote = useCallback(async (type: NoteType): Promise<string> => {
    const id = makeNoteId()
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: '',
      content: type === 'checklist' ? '[]' : '',
      type,
      color: null,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }, [db])

  const updateNote = useCallback(async (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'isPinned'>>,
  ) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ ...patch, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.map(n =>
      n.id === id ? { ...n, ...patch, updatedAt: now } : n
    ))
  }, [db])

  const deleteNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isTrashed: true, trashedAt: now, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const archiveNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isArchived: true, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const unarchiveNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isArchived: false, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const restoreNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isTrashed: false, trashedAt: null, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const permanentlyDeleteNote = useCallback(async (id: string) => {
    await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, id))
    await db.delete(notesTable).where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const emptyTrash = useCallback(async () => {
    const trashed = await db.select({ id: notesTable.id })
      .from(notesTable).where(eq(notesTable.isTrashed, true))
    for (const row of trashed) {
      await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, row.id))
    }
    await db.delete(notesTable).where(eq(notesTable.isTrashed, true))
    setNotesList([])
  }, [db])

  const pruneOldTrashedNotes = useCallback(async () => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const old = await db.select({ id: notesTable.id })
      .from(notesTable)
      .where(and(eq(notesTable.isTrashed, true), lt(notesTable.trashedAt, cutoff)))
    for (const row of old) {
      await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, row.id))
    }
    await db.delete(notesTable)
      .where(and(eq(notesTable.isTrashed, true), lt(notesTable.trashedAt, cutoff)))
  }, [db])

  return {
    notes: notesList,
    createNote,
    updateNote,
    deleteNote,
    archiveNote,
    unarchiveNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    pruneOldTrashedNotes,
  }
}
