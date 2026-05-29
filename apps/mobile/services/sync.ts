import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedListings, savedDecks, userProgress, practiceSessions,
  notes as notesTable, noteLabels, noteLabelAssignments,
} from '../db/schema'
import { supabase } from './supabase'

export async function syncPrimaryListing(db: DrizzleClient): Promise<void> {
  const rows = await db
    .select({ listingSlug: focusListings.listingSlug })
    .from(focusListings)
    .orderBy(asc(focusListings.priority))
    .limit(1)
  const slug = rows[0]?.listingSlug ?? ''
  await db.update(userSettings)
    .set({ selectedListingSlug: slug })
    .where(eq(userSettings.id, 1))
}

// Push local user data to Supabase for backup (requires signed-in session)
export async function pushUserData(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const [focus, saved, decks, progress, sessions, settings, noteRows, labelRows, assignRows] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
  ])

  await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settings[0] ?? {},
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// Pull user data from Supabase and restore into local DB
export async function pullUserData(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('user_app_data')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (error || !data) return

  await db.transaction((tx) => {
    // Restore focus listings (upsert by listingSlug)
    const remoteF: typeof focusListings.$inferInsert[] = data.focus_listings ?? []
    for (const row of remoteF) {
      tx.insert(focusListings)
        .values(row)
        .onConflictDoUpdate({
          target: focusListings.listingSlug,
          set: { priority: row.priority, addedAt: row.addedAt },
        })
        .run()
    }

    // Restore saved listings (upsert by id)
    const remoteS: typeof savedListings.$inferInsert[] = data.saved_listings ?? []
    for (const row of remoteS) {
      tx.insert(savedListings)
        .values(row)
        .onConflictDoUpdate({ target: savedListings.id, set: { savedAt: row.savedAt } })
        .run()
    }

    // Restore saved decks (upsert by id)
    const remoteD: typeof savedDecks.$inferInsert[] = data.saved_decks ?? []
    for (const row of remoteD) {
      tx.insert(savedDecks)
        .values(row)
        .onConflictDoUpdate({
          target: savedDecks.id,
          set: { name: row.name, topicIds: row.topicIds },
        })
        .run()
    }

    // Restore practice sessions — Supabase is source of truth at sign-in time
    const remoteSessions: typeof practiceSessions.$inferInsert[] = data.practice_sessions ?? []
    if (remoteSessions.length > 0) {
      tx.delete(practiceSessions).run()
      for (const row of remoteSessions) {
        tx.insert(practiceSessions).values(row).run()
      }
    }

    // Restore user progress (same wipe-and-restore approach)
    const remoteProgress: typeof userProgress.$inferInsert[] = data.user_progress ?? []
    if (remoteProgress.length > 0) {
      tx.delete(userProgress).run()
      for (const row of remoteProgress) {
        tx.insert(userProgress).values(row).run()
      }
    }

    // Restore full settings row (all writeable fields, not just profile)
    const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert> | null
    if (remoteSettings) {
      const settingsValues = {
        id: 1,
        googleId: remoteSettings.googleId ?? '',
        email: remoteSettings.email ?? '',
        fullName: remoteSettings.fullName ?? '',
        school: remoteSettings.school ?? '',
        gradeLevel: remoteSettings.gradeLevel ?? null,
        selectedListingSlug: remoteSettings.selectedListingSlug ?? '',
        lastSyncedAt: 0,  // force catalog re-sync on next launch
        notificationsEnabled: remoteSettings.notificationsEnabled ?? true,
        theme: remoteSettings.theme ?? 'system',
        focusModeEnabled: remoteSettings.focusModeEnabled ?? true,
      }
      tx.insert(userSettings)
        .values(settingsValues)
        .onConflictDoUpdate({ target: userSettings.id, set: settingsValues })
        .run()
    }

    // Restore notes — wipe and restore (guard matches practice_sessions/user_progress pattern)
    const remoteNotes: typeof notesTable.$inferInsert[] = data.notes ?? []
    if (remoteNotes.length > 0) {
      tx.delete(noteLabelAssignments).run()
      tx.delete(notesTable).run()
      for (const row of remoteNotes) {
        tx.insert(notesTable).values(row).onConflictDoNothing().run()
      }
    }

    // Restore note labels
    const remoteLabels: typeof noteLabels.$inferInsert[] = data.note_labels ?? []
    if (remoteLabels.length > 0) {
      tx.delete(noteLabels).run()
      for (const row of remoteLabels) {
        tx.insert(noteLabels).values(row).onConflictDoNothing().run()
      }
    }

    // Restore note label assignments
    const remoteAssigns: typeof noteLabelAssignments.$inferInsert[] = data.note_label_assignments ?? []
    for (const row of remoteAssigns) {
      tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()
    }
  })
}

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  try {
    const [settingsRows, focusRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select().from(focusListings).orderBy(asc(focusListings.priority)),
    ])
    const settings = settingsRows[0]
    if (!settings) return

    let slugs = focusRows.map(r => r.listingSlug)
    if (slugs.length === 0 && settings.selectedListingSlug) slugs = [settings.selectedListingSlug]
    if (slugs.length === 0) return

    const since = settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()

    const [listingsRes, subjectsRes, topicsRes] = await Promise.all([
      supabase.from('listings')
        .select('id,slug,title,type,status,exam_date,region,description,requirements,coverage,provider,external_url,deadline,grant_amount')
        .gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
    ])

    const cardResults = await Promise.all(
      slugs.map(slug =>
        supabase.from('flashcards')
          .select('id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,ai_options,ai_correct_index,ai_explanation,ai_enhanced_at,updated_at')
          .contains('listing_slugs', [slug])
          .eq('status', 'published')
          .gt('updated_at', since)
      )
    )

    const seen = new Set<string>()
    const allCards = cardResults.flatMap(r => r.data ?? []).filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    })

    await db.transaction((tx) => {
      for (const row of (listingsRes.data ?? [])) {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        const deadline = row.deadline ? new Date(row.deadline).getTime() : null
        const vals = {
          id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status,
          examDate, region: row.region ?? '', description: row.description ?? '',
          requirements: JSON.stringify(row.requirements ?? []), coverage: row.coverage ?? '',
          provider: row.provider ?? '', externalUrl: row.external_url ?? '', deadline,
          grantAmount: row.grant_amount != null ? String(row.grant_amount) : '',
        }
        tx.insert(listings).values(vals).onConflictDoUpdate({ target: listings.id, set: vals }).run()
      }

      for (const row of (subjectsRes.data ?? [])) {
        tx.insert(subjects).values({ id: row.id, name: row.name })
          .onConflictDoUpdate({ target: subjects.id, set: { name: row.name } }).run()
      }

      for (const row of (topicsRes.data ?? [])) {
        tx.insert(topics)
          .values({ id: row.id, name: row.name, subjectId: row.subject_id, status: row.status })
          .onConflictDoUpdate({ target: topics.id, set: { name: row.name, subjectId: row.subject_id, status: row.status } })
          .run()
      }

      for (const row of allCards) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        const baseVals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []),
          options: JSON.stringify(row.options ?? []),
          correctAnswerIndex: row.correct_answer_index ?? null,
          remoteUpdatedAt,
        }

        // Only include ai_* fields when Supabase actually has them. This preserves
        // local Gemma work when Supabase hasn't been enhanced yet (fixes the
        // sync-wipe bug where every re-sync used to null these out).
        const r = row as any
        const aiVals = r.ai_enhanced_at
          ? {
              aiOptions: r.ai_options ? JSON.stringify(r.ai_options) : null,
              aiCorrectIndex: r.ai_correct_index ?? null,
              aiExplanation: r.ai_explanation ?? null,
              aiEnhancedAt: new Date(r.ai_enhanced_at).getTime(),
            }
          : {}

        const vals = { ...baseVals, ...aiVals }
        tx.insert(flashcards).values(vals).onConflictDoUpdate({
          target: flashcards.id,
          set: vals,  // ai_* only included when Supabase had them
        }).run()
      }

      const syncedAt = Date.now()
      tx.insert(userSettings)
        .values({ id: 1, selectedListingSlug: slugs[0]!, lastSyncedAt: syncedAt })
        .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, selectedListingSlug: slugs[0]! } })
        .run()
    })

    // Also push user data backup if signed in
    await pushUserData(db)
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
