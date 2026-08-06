import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as DocumentPicker from 'expo-document-picker'
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  userSettings,
  focusListings,
  savedDecks,
  userProgress,
  practiceSessions,
  notes as notesTable,
  noteLabels,
  noteLabelAssignments,
  questionAttempts,
  flashcardSrs,
  studyPlanItems,
} from '../db/schema'
import { invalidate } from './queryCache'

const { StorageAccessFramework } = FileSystem

export type ExportResult =
  | { status: 'saved'; filename: string }
  | { status: 'cancelled' }

export async function exportUserData(db: DrizzleClient): Promise<ExportResult> {
  const [settings, focus, decks, progress, sessions, noteRows, labelRows, assignRows, attempts, srsRows, planRows] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(focusListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
    db.select().from(questionAttempts),
    db.select().from(flashcardSrs),
    db.select().from(studyPlanItems),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    settings: settings[0] ?? null,
    focus_listings: focus,
    // Note: old export files may contain saved_listings — it is ignored on import (field removed).
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    question_attempts: attempts,
    flashcard_srs: srsRows,
    study_plan_items: planRows,
  }

  const json = JSON.stringify(payload, null, 2)
  const filename = `iskotify-export-${new Date().toISOString().slice(0, 10)}.json`

  // ── Web: Blob + anchor-click download ────────────────────────────────────
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { status: 'saved', filename }
  }

  if (Platform.OS === 'android') {
    const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync()
    if (!perms.granted) return { status: 'cancelled' }
    const fileUri = await StorageAccessFramework.createFileAsync(
      perms.directoryUri,
      filename,
      'application/json',
    )
    await StorageAccessFramework.writeAsStringAsync(fileUri, json)
    return { status: 'saved', filename }
  }

  // iOS — share sheet is the iOS-native export paradigm
  const fileUri = `${FileSystem.documentDirectory}${filename}`
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Iskotify Data',
  })
  return { status: 'saved', filename }
}

type ExportRow = Record<string, unknown>

export async function importUserData(db: DrizzleClient): Promise<void> {
  // ── Web: import is out of scope for W1 — show a helpful message ──────────
  if (Platform.OS === 'web') {
    throw new Error('Data import is available on the mobile app. Export your data there and restore it on the same device.')
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  })
  if (result.canceled) return

  const file = result.assets[0]
  if (!file?.uri) throw new Error('No file selected')

  const raw = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('File is not valid JSON')
  }

  if (!data.exported_at || !data.settings) {
    throw new Error('This file is not a valid Iskotify export')
  }

  // Restore settings (upsert singleton row)
  const s = data.settings as ExportRow
  await db.insert(userSettings).values({
    id: 1,
    selectedListingSlug: String(s.selectedListingSlug ?? s.selected_listing_slug ?? ''),
    lastSyncedAt: Number(s.lastSyncedAt ?? s.last_synced_at ?? 0),
    fullName: String(s.fullName ?? s.full_name ?? ''),
    school: String(s.school ?? ''),
    gradeLevel: s.gradeLevel != null ? Number(s.gradeLevel) : s.grade_level != null ? Number(s.grade_level) : null,
    googleId: s.googleId ? String(s.googleId) : s.google_id ? String(s.google_id) : null,
    email: s.email ? String(s.email) : null,
    notificationsEnabled: Boolean(s.notificationsEnabled ?? s.notifications_enabled ?? true),
    theme: String(s.theme ?? 'system'),
    dailyReminderHour: Number(s.dailyReminderHour ?? s.daily_reminder_hour ?? 9),
    weeklySummaryEnabled: Boolean(s.weeklySummaryEnabled ?? s.weekly_summary_enabled ?? true),
  }).onConflictDoUpdate({
    target: userSettings.id,
    set: {
      selectedListingSlug: String(s.selectedListingSlug ?? s.selected_listing_slug ?? ''),
      fullName: String(s.fullName ?? s.full_name ?? ''),
      school: String(s.school ?? ''),
      gradeLevel: s.gradeLevel != null ? Number(s.gradeLevel) : s.grade_level != null ? Number(s.grade_level) : null,
      googleId: s.googleId ? String(s.googleId) : s.google_id ? String(s.google_id) : null,
      email: s.email ? String(s.email) : null,
      notificationsEnabled: Boolean(s.notificationsEnabled ?? s.notifications_enabled ?? true),
      theme: String(s.theme ?? 'system'),
      dailyReminderHour: Number(s.dailyReminderHour ?? s.daily_reminder_hour ?? 9),
      weeklySummaryEnabled: Boolean(s.weeklySummaryEnabled ?? s.weekly_summary_enabled ?? true),
    },
  })

  // Focus listings — replace entirely
  await db.delete(focusListings)
  const focusRows = Array.isArray(data.focus_listings) ? (data.focus_listings as ExportRow[]) : []
  for (const row of focusRows) {
    const slug = String(row.listingSlug ?? row.listing_slug ?? '')
    if (!slug) continue
    await db.insert(focusListings).values({
      listingSlug: slug,
      priority: Number(row.priority ?? 0),
      addedAt: Number(row.addedAt ?? row.added_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // Note: old export files may contain saved_listings — it is ignored here (field removed).

  // Saved decks — replace entirely
  await db.delete(savedDecks)
  const deckRows = Array.isArray(data.saved_decks) ? (data.saved_decks as ExportRow[]) : []
  for (const row of deckRows) {
    const id = String(row.id ?? '')
    if (!id) continue
    await db.insert(savedDecks).values({
      id,
      name: String(row.name ?? ''),
      topicIds: String(row.topicIds ?? row.topic_ids ?? '[]'),
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // User progress — replace entirely
  await db.delete(userProgress)
  const progressRows = Array.isArray(data.user_progress) ? (data.user_progress as ExportRow[]) : []
  for (const row of progressRows) {
    await db.insert(userProgress).values({
      flashcardId: String(row.flashcardId ?? row.flashcard_id ?? ''),
      correct: Boolean(row.correct),
      answeredAt: Number(row.answeredAt ?? row.answered_at ?? Date.now()),
    })
  }

  // Practice sessions — replace entirely
  await db.delete(practiceSessions)
  const sessionRows = Array.isArray(data.practice_sessions) ? (data.practice_sessions as ExportRow[]) : []
  for (const row of sessionRows) {
    await db.insert(practiceSessions).values({
      listingSlug: String(row.listingSlug ?? row.listing_slug ?? ''),
      topicId: String(row.topicId ?? row.topic_id ?? ''),
      deckId: String(row.deckId ?? row.deck_id ?? ''),
      score: Number(row.score ?? 0),
      total: Number(row.total ?? 0),
      durationSecs: Number(row.durationSecs ?? row.duration_secs ?? 0),
      completedAt: Number(row.completedAt ?? row.completed_at ?? Date.now()),
    })
  }

  // Question attempts (Task D telemetry) — replace entirely. Optional: older
  // export files predate this field.
  await db.delete(questionAttempts)
  const attemptRows = Array.isArray(data.question_attempts) ? (data.question_attempts as ExportRow[]) : []
  for (const row of attemptRows) {
    await db.insert(questionAttempts).values({
      sessionKey: Number(row.sessionKey ?? row.session_key ?? 0),
      sourceTable: String(row.sourceTable ?? row.source_table ?? ''),
      questionId: String(row.questionId ?? row.question_id ?? ''),
      listingSlug: String(row.listingSlug ?? row.listing_slug ?? ''),
      subtest: row.subtest != null ? String(row.subtest) : null,
      topic: row.topic != null ? String(row.topic) : null,
      selectedIndex: row.selectedIndex != null ? Number(row.selectedIndex) : row.selected_index != null ? Number(row.selected_index) : null,
      correctIndex: Number(row.correctIndex ?? row.correct_index ?? 0),
      correct: Boolean(row.correct),
      elapsedMs: Number(row.elapsedMs ?? row.elapsed_ms ?? 0),
      answeredAt: Number(row.answeredAt ?? row.answered_at ?? Date.now()),
    })
  }

  // Flashcard SRS state (Task H) — replace entirely. Optional: older export
  // files predate this field.
  await db.delete(flashcardSrs)
  const srsImportRows = Array.isArray(data.flashcard_srs) ? (data.flashcard_srs as ExportRow[]) : []
  for (const row of srsImportRows) {
    const flashcardId = String(row.flashcardId ?? row.flashcard_id ?? '')
    if (!flashcardId) continue
    await db.insert(flashcardSrs).values({
      flashcardId,
      intervalDays: Number(row.intervalDays ?? row.interval_days ?? 0),
      easeFactor: Number(row.easeFactor ?? row.ease_factor ?? 2.5),
      repetitions: Number(row.repetitions ?? 0),
      lapses: Number(row.lapses ?? 0),
      dueAt: Number(row.dueAt ?? row.due_at ?? 0),
      lastReviewedAt: row.lastReviewedAt != null ? Number(row.lastReviewedAt) : row.last_reviewed_at != null ? Number(row.last_reviewed_at) : null,
      lastGrade: row.lastGrade != null ? String(row.lastGrade) : row.last_grade != null ? String(row.last_grade) : null,
    }).onConflictDoNothing()
  }

  // Study plan items (Task I) — replace entirely. Optional: older export
  // files predate this field.
  await db.delete(studyPlanItems)
  const planImportRows = Array.isArray(data.study_plan_items) ? (data.study_plan_items as ExportRow[]) : []
  for (const row of planImportRows) {
    const planDate = String(row.planDate ?? row.plan_date ?? '')
    const kind = String(row.kind ?? '')
    if (!planDate || !kind) continue
    await db.insert(studyPlanItems).values({
      planDate,
      kind,
      refId: String(row.refId ?? row.ref_id ?? ''),
      targetCount: Number(row.targetCount ?? row.target_count ?? 1),
      completedAt: row.completedAt != null ? Number(row.completedAt) : row.completed_at != null ? Number(row.completed_at) : null,
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
    })
  }

  // Notes — replace entirely
  await db.delete(noteLabelAssignments)
  await db.delete(notesTable)
  const noteImportRows = Array.isArray(data.notes) ? (data.notes as ExportRow[]) : []
  for (const row of noteImportRows) {
    const id = String(row.id ?? '')
    if (!id) continue
    await db.insert(notesTable).values({
      id,
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      type: String(row.type ?? 'text'),
      color: row.color ? String(row.color) : null,
      isPinned: Boolean(row.isPinned ?? row.is_pinned ?? false),
      isArchived: Boolean(row.isArchived ?? row.is_archived ?? false),
      isTrashed: Boolean(row.isTrashed ?? row.is_trashed ?? false),
      trashedAt: row.trashedAt != null ? Number(row.trashedAt) : row.trashed_at != null ? Number(row.trashed_at) : null,
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
      updatedAt: Number(row.updatedAt ?? row.updated_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // Note labels — replace entirely
  await db.delete(noteLabels)
  const labelImportRows = Array.isArray(data.note_labels) ? (data.note_labels as ExportRow[]) : []
  for (const row of labelImportRows) {
    const id = String(row.id ?? '')
    if (!id) continue
    await db.insert(noteLabels).values({
      id,
      name: String(row.name ?? ''),
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // Note label assignments — replace entirely
  const assignImportRows = Array.isArray(data.note_label_assignments) ? (data.note_label_assignments as ExportRow[]) : []
  for (const row of assignImportRows) {
    const noteId = String(row.noteId ?? row.note_id ?? '')
    const labelId = String(row.labelId ?? row.label_id ?? '')
    if (!noteId || !labelId) continue
    await db.insert(noteLabelAssignments).values({ noteId, labelId }).onConflictDoNothing()
  }

  // Invalidate all caches after a full data import
  invalidate('')
}
