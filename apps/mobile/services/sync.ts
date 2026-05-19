import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedListings, savedDecks, userProgress, practiceSessions,
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

  const [focus, saved, decks, progress, sessions, settings] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
  ])

  await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settings[0] ?? {},
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
    // Restore focus listings
    const remoteF: typeof focusListings.$inferInsert[] = data.focus_listings ?? []
    for (const row of remoteF) {
      tx.insert(focusListings)
        .values(row)
        .onConflictDoUpdate({ target: focusListings.listingSlug, set: { priority: row.priority, addedAt: row.addedAt } })
        .run()
    }

    // Restore saved listings
    const remoteS: typeof savedListings.$inferInsert[] = data.saved_listings ?? []
    for (const row of remoteS) {
      tx.insert(savedListings)
        .values(row)
        .onConflictDoUpdate({ target: savedListings.id, set: { savedAt: row.savedAt } })
        .run()
    }

    // Restore saved decks
    const remoteD: typeof savedDecks.$inferInsert[] = data.saved_decks ?? []
    for (const row of remoteD) {
      tx.insert(savedDecks)
        .values(row)
        .onConflictDoUpdate({ target: savedDecks.id, set: { name: row.name, topicIds: row.topicIds } })
        .run()
    }

    // Restore user settings (profile fields only — don't overwrite local selectedListingSlug)
    const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert>
    if (remoteSettings?.fullName || remoteSettings?.school || remoteSettings?.email) {
      tx.insert(userSettings)
        .values({
          id: 1,
          googleId: remoteSettings.googleId ?? '',
          email: remoteSettings.email ?? '',
          fullName: remoteSettings.fullName ?? '',
          school: remoteSettings.school ?? '',
          gradeLevel: remoteSettings.gradeLevel ?? null,
          selectedListingSlug: '',
          lastSyncedAt: 0,
        })
        .onConflictDoUpdate({
          target: userSettings.id,
          set: {
            googleId: remoteSettings.googleId ?? '',
            email: remoteSettings.email ?? '',
            fullName: remoteSettings.fullName ?? '',
            school: remoteSettings.school ?? '',
            gradeLevel: remoteSettings.gradeLevel ?? null,
          },
        })
        .run()
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
          .select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,updated_at')
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
        const vals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation, difficulty: row.difficulty,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []), remoteUpdatedAt,
        }
        tx.insert(flashcards).values(vals).onConflictDoUpdate({ target: flashcards.id, set: vals }).run()
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
