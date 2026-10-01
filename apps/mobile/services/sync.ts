import { eq, asc, inArray, sql, and, lte, isNotNull } from 'drizzle-orm'
import { invalidate } from './queryCache'
import { scheduleWebPersist } from '../db/webPersist'
import { hasSensitiveConsent, mergeConsent, SENSITIVE_CLEARED, type ConsentSnapshot } from '../utils/consent'
import { markSyncStart, markSyncDone, markSyncError, clearSyncError, BACKUP_FAILED_MESSAGE } from './syncStatus'
import { forgetPremiumState } from './premiumState'
export { BACKUP_FAILED_MESSAGE } from './syncStatus'
import { isSchoolFocusSlug } from '../utils/focusSlug'
import {
  registerPusher, schedulePushUserData, flushPendingPush, cancelPendingPush,
  PUSH_DEBOUNCE_MS, _resetPushSchedulerForTests,
} from './pushScheduler'
import { pruneOldAttempts } from './pruneAttempts'
import { STUDY_TABLES } from './resetStudyData'
import { resetAnalytics } from '../lib/analytics'

// ── Sync heal ──────────────────────────────────────────────────────────────────
// Bump this when a bug causes devices to miss rows they should have synced.
// Devices with a stored syncRev < SYNC_REV will do a full re-pull on next
// launch (since = epoch), then write syncRev = SYNC_REV into the settings row.
// Reason for rev 1: pre-pagination builds capped Supabase at 1000 rows so up
// to ~253 flashcards never reached devices. The paginated fetch now pulls all
// 1253+. Forcing a full re-pull recovers those missed cards.
// Reason for rev 2: incremental-mirror cutover + status backfill. All catalog
// tables (career, university, blueprint) now use an updated_at cursor instead
// of full-pull, and flashcards gains a local status column. A full re-pull
// baselines all devices with the correct status values.
const SYNC_REV = 2
import type { DrizzleClient } from '../db/client'
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedDecks, userProgress, practiceSessions,
  userRequirements, questionAttempts, flashcardSrs, studyPlanItems,
  notes as notesTable, noteLabels, noteLabelAssignments,
  upcatPassages, upcatQuestions, upcatFacts, upcatCutoffs,
  careerCourses, careerDestinations, careerCountries, careerPrograms,
  aiCareerImpact, careerFacts,
  tertiarySchools, universityProfiles, courseSchoolRankings,
  courseSchoolQuality, barResults, courseTaxonomyMap,
  admissionsUpdates,
  examSkillCategories, examBlueprints, examBlueprintSections, examCourseNotes,
} from '../db/schema'
import { supabase } from './supabase'
import { pushPendingReports } from './questionReports'
import { batchUpsert } from './syncBatch'
import { fetchContentStatusFeed, applyContentStatusFeed } from './contentStatusFeed'

// Supabase caps a single SELECT at 1000 rows. For tables that exceed that
// (flashcards, upcat_questions, course_school_rankings) we page with .range()
// until a short page returns, so the FULL set reaches the device instead of a
// silently-truncated first 1000. makeQuery MUST apply a stable .order() so pages
// don't skip/duplicate rows.
async function fetchAllPaginated<T = Record<string, unknown>>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

// ── Question-media column fallback ──────────────────────────────────────────
// image_url/image_alt/image_width/image_height on upcat_questions/flashcards
// are added by Supabase migration 054, which — per this repo's convention —
// is applied MANUALLY (pasted into the SQL editor), not by this app. Until
// that happens, a SELECT naming these columns makes PostgREST reject the
// WHOLE query (42703 "column ... does not exist"), which would otherwise take
// down ALL question/flashcard sync. Detect that specific failure and retry
// once with the legacy (pre-image) column list so sync degrades to "no
// figures yet" instead of breaking entirely.
export function isColumnMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  // Only an undefined *column* — a missing table or function must surface, not
  // be retried away with the legacy column list.
  return e.code === '42703' || (typeof e.message === 'string' && /\bcolumn\b.*does not exist/i.test(e.message))
}

const UPCAT_QUESTIONS_BASE_COLUMNS =
  'question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,question_text,options,correct_index,explanation,set_id,set_position,has_visual,status,skill_category,option_explanations,strategy_tip'
const QUESTION_MEDIA_COLUMNS = 'image_url,image_alt,image_width,image_height'
const UPCAT_QUESTIONS_COLUMNS = `${UPCAT_QUESTIONS_BASE_COLUMNS},${QUESTION_MEDIA_COLUMNS},updated_at`
const UPCAT_QUESTIONS_COLUMNS_LEGACY = `${UPCAT_QUESTIONS_BASE_COLUMNS},updated_at`

/** Paginated upcat_questions pull with the column-missing fallback above. */
async function fetchUpcatQuestionsRows(since: string): Promise<any[]> {
  const run = (columns: string) => fetchAllPaginated((from, to) => supabase.from('upcat_questions')
    .select(columns)
    .gt('updated_at', since)
    .order('question_id')
    .range(from, to))
  try {
    return await run(UPCAT_QUESTIONS_COLUMNS)
  } catch (err) {
    if (!isColumnMissingError(err)) throw err
    console.warn('[sync] upcat_questions: image columns not migrated yet on Supabase — retrying with the legacy column list', err)
    return await run(UPCAT_QUESTIONS_COLUMNS_LEGACY)
  }
}

const FLASHCARDS_BASE_COLUMNS =
  'id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,ai_options,ai_correct_index,ai_explanation,ai_enhanced_at,status,option_explanations,strategy_tip'
const FLASHCARDS_COLUMNS = `${FLASHCARDS_BASE_COLUMNS},${QUESTION_MEDIA_COLUMNS},updated_at`
const FLASHCARDS_COLUMNS_LEGACY = `${FLASHCARDS_BASE_COLUMNS},updated_at`

/**
 * Per-slug paginated flashcards pull (deduped by id) with the column-missing
 * fallback above. Empty contentSlugs short-circuits to [] exactly like the
 * previous inline `contentSlugs.length === 0 ? [] : …` guard.
 */
async function fetchFlashcardsForSlugs(contentSlugs: string[], since: string): Promise<any[]> {
  const run = async (columns: string): Promise<any[]> => {
    if (contentSlugs.length === 0) return []
    const cardResults = await Promise.all(
      contentSlugs.map(slug =>
        fetchAllPaginated((from, to) => supabase.from('flashcards')
          .select(columns)
          .contains('listing_slugs', [slug])
          .gt('updated_at', since)
          .order('id')
          .range(from, to)))
    )
    const seen = new Set<string>()
    return cardResults.flat().filter((r: any) => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    })
  }
  try {
    return await run(FLASHCARDS_COLUMNS)
  } catch (err) {
    if (!isColumnMissingError(err)) throw err
    console.warn('[sync] flashcards: image columns not migrated yet on Supabase — retrying with the legacy column list', err)
    return await run(FLASHCARDS_COLUMNS_LEGACY)
  }
}

export async function syncPrimaryListing(db: DrizzleClient): Promise<void> {
  const rows = await db
    .select({ listingSlug: focusListings.listingSlug })
    .from(focusListings)
    .orderBy(asc(focusListings.priority))
    .limit(1)
  const raw = rows[0]?.listingSlug ?? ''
  // selectedListingSlug is consumed app-wide as a CONTENT slug — map a
  // school-level focus ("school:<id>") to its general-practice content slug.
  const slug = raw && isSchoolFocusSlug(raw) ? 'general-cet' : raw
  await db.update(userSettings)
    .set({ selectedListingSlug: slug })
    .where(eq(userSettings.id, 1))
}

// Push local user data to Supabase for backup (requires signed-in session).
// Resolves true when the backup row was written, false when signed out or when
// the upsert was rejected (the error is logged; the next push retries in full).
/**
 * The Full Access cache (premium_cached / premium_checked_at / premium_user_id) is this device's
 * copy of the store / server answer, not the student's data: it never goes into
 * the backup (and the restore below never reads it back).
 */
function withoutPremiumCache<T extends { premiumCached?: unknown; premiumCheckedAt?: unknown; premiumUserId?: unknown }>(row: T): Omit<T, 'premiumCached' | 'premiumCheckedAt' | 'premiumUserId'> {
  const { premiumCached: _p, premiumCheckedAt: _c, premiumUserId: _u, ...rest } = row
  return rest
}

export async function pushUserData(db: DrizzleClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // question_attempts is bounded by hooks/useRecordAttempts.ts's
  // pruneOldAttempts (utils/attemptRetention.ts, MAX_RETAINED_ATTEMPTS =
  // 5000 rows) — this SELECT is a full-table read, but the table itself is
  // capped, so this payload does NOT grow without bound across a user's
  // lifetime the way it would without that retention pruning.
  // Settings (the owner) first: an account-switch wipe that lands mid-read must not
  // leave an old-owner check paired with emptied tables.
  const settings = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const [focus, decks, progress, sessions, noteRows, labelRows, assignRows, reqRows, attempts, srsRows, planRows] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
    db.select().from(userRequirements),
    db.select().from(questionAttempts),
    db.select().from(flashcardSrs),
    db.select().from(studyPlanItems),
  ])

  // Never upload another account's local data into this account's backup row.
  // An unowned (anonymous) database is claimed by the account that first pushes.
  const storedOwner = settings[0]?.ownerUserId ?? ''
  if (storedOwner && storedOwner !== user.id) {
    console.warn('[sync] backup push skipped: local data belongs to a different account')
    return false
  }
  if (!storedOwner && settings[0]) {
    await db.update(userSettings).set({ ownerUserId: user.id }).where(eq(userSettings.id, 1))
  }

  // Never overwrite a (possibly populated) backup with NOTHING: a device that has not
  // completed a pull for this owner and holds no user data at all has nothing worth
  // saving, and its push would erase the real backup.
  const hasLocalData = focus.length + decks.length + progress.length + sessions.length + noteRows.length +
    labelRows.length + assignRows.length + reqRows.length + attempts.length + srsRows.length + planRows.length > 0 ||
    !!settings[0]?.fullName?.trim()
  if (settings[0] && (settings[0].lastPullOkAt ?? 0) === 0 && !hasLocalData) {
    console.warn('[sync] backup push skipped: empty device that has never pulled this account')
    return false
  }
  // Consent (P1b). The backup may hold a choice made on another device after this
  // one's: a withdrawal of the sensitive-data consent, analytics switched off. It is
  // merged in first (same rules as a pull, utils/consent.ts mergeConsent), so this
  // upload can never bring back withdrawn details or erase the withdrawal from the
  // backup. If the backup cannot be read there is no upload: it could hold one.
  let settingsRow = settings[0]
  if (settingsRow) {
    const remote = await fetchBackupSettings(user.id)
    if (remote === 'unreadable') {
      console.warn('[sync] backup push skipped: could not read the backup consent first')
      markSyncError(BACKUP_FAILED_MESSAGE)
      return false
    }
    if (remote) {
      const consent = resolveConsent(settingsRow, remote, (settingsRow.lastPullOkAt ?? 0) === 0)
      const before: Record<string, unknown> = settingsRow
      if (Object.entries(consent).some(([k, v]) => before[k] !== v)) {
        await db.update(userSettings).set(consent).where(eq(userSettings.id, 1))
        settingsRow = { ...settingsRow, ...consent }
        invalidate('settings:')
        scheduleWebPersist()
      }
    }
    // Sensitive details only travel with consent: values stored before consent
    // existed (or left by an older build) are uploaded cleared.
    if (!hasSensitiveConsent(settingsRow)) settingsRow = { ...settingsRow, ...SENSITIVE_CLEARED }
  }

  // Every real upload attempt marks the data unsynced first (monotonic) and only a
  // confirmed success clears it. A failed upload — including the one right after a
  // first-sign-in merge — therefore leaves the device dirty, so the next pull pushes
  // before it would ever replace curated data with an older backup.
  const dirtyAtSeen = Math.max(settings[0]?.pushDirtyAt ?? 0, Date.now())
  if (settings[0]) {
    await db.update(userSettings).set({ pushDirtyAt: dirtyAtSeen })
      .where(and(eq(userSettings.id, 1), lte(userSettings.pushDirtyAt, dirtyAtSeen)))
  }

  const { error } = await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settingsRow ? withoutPremiumCache(settingsRow) : {},
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    user_requirements: reqRows,
    question_attempts: attempts,
    flashcard_srs: srsRows,
    study_plan_items: planRows,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) {
    console.warn('[sync] backup push failed:', error)
    // Never silent: while uploads fail this device keeps its edits (marked unsynced)
    // and stops taking curated updates from other devices — say so, with Retry.
    markSyncError(BACKUP_FAILED_MESSAGE)
    return false
  }
  clearSyncError(BACKUP_FAILED_MESSAGE)
  // The upsert truly succeeded: clear the unsynced marker — but only if no edit marked
  // it dirty again while this push was in flight (that edit is not in this snapshot).
  if (settings[0]) {
    await db.update(userSettings).set({ pushDirtyAt: 0 })
      .where(and(eq(userSettings.id, 1), lte(userSettings.pushDirtyAt, dirtyAtSeen)))
  }
  return true
}

/**
 * Best-effort backup of unsynced edits right before the session is dropped
 * (sign out): after it the device cannot push, and the next sign-in may pull.
 * Never throws and never blocks sign-out for long.
 */
export async function pushBeforeSignOut(db: DrizzleClient): Promise<void> {
  try {
    await flushPendingPush()
    const rows = await db.select({ d: userSettings.pushDirtyAt }).from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    if ((rows[0]?.d ?? 0) > 0) await pushUserData(db)
  } catch (e) {
    console.warn('[sync] push before sign-out failed (non-fatal):', e)
  }
}

// Fire-and-forget callers (after each session, focus change…) go through the
// debounced, serialized scheduler in ./pushScheduler (re-exported here): N rapid
// calls become ONE full push of the latest state, and pushes never overlap.
// Awaited callers (sign-in, launch) keep calling pushUserData directly.
registerPusher(pushUserData)
export { schedulePushUserData, flushPendingPush, cancelPendingPush, PUSH_DEBOUNCE_MS, _resetPushSchedulerForTests }

// ── Account ownership ──────────────────────────────────────────────────────────
// The local DB belongs to ONE Supabase account at a time (user_settings.owner_user_id).
// Anonymous (no owner evidence) -> first sign-in keeps the local data. A DIFFERENT
// account signing in on the same device must never see or upload the previous
// user's data, so their user tables are wiped first. The catalog (listings,
// flashcards, questions, blueprints…) and the sync cursor stay.
//  - 'claimed':  device had no owner (anonymous, or an upgraded install of the SAME user)
//  - 'same':     owner already matches
//  - 'switched': a different account — previous user's data wiped
export type OwnerChange = 'claimed' | 'same' | 'switched'

// Per-user columns of user_settings reset on an account switch. NOT reset:
// lastSyncedAt/syncRev (catalog cursor), theme/aiProvider/tourSeenAt (device prefs).
const USER_SETTINGS_RESET = {
  selectedListingSlug: '',
  fullName: '',
  school: '',
  gradeLevel: null,
  googleId: null,
  email: null,
  notificationsEnabled: true,
  focusModeEnabled: true,
  googleCalendarConnected: false,
  incomeBracket: null,
  gwa: null,
  province: null,
  city: null,
  hsGwaG8: null,
  hsGwaG9: null,
  hsGwaG10: null,
  hsGwaG11: null,
  schoolType: null,
  isIndigenous: false,
  targetCampus: null,
  scoreDisclaimerAck: false,
  targetExams: '[]',
  targetCourses: '[]',
  schoolRegion: '',
  dailyReminderHour: 9,
  weeklySummaryEnabled: true,
  onboardingStep: '',
  // Consent belongs to the person, not the device: the next account is asked afresh.
  ageBand: '',
  consentVersion: '',
  consentedAt: 0,
  guardianConsentAt: 0,
  sensitiveConsentAt: 0,
  analyticsOptIn: null,
  sensitiveWithdrawnAt: 0,
  analyticsChoiceAt: 0,
  // Full Access belongs to the account: the next one starts free until its own check.
  premiumCached: false,
  premiumCheckedAt: 0,
  premiumUserId: '',
  // The next person sees Today's scholarship-profile prompt afresh.
  profilePromptDismissedAt: 0,
  pushDirtyAt: 0,
  lastPullOkAt: 0,
} satisfies Partial<typeof userSettings.$inferInsert>

const trimmed = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

export async function reconcileAccountOwner(
  db: DrizzleClient,
  userId: string,
  email?: string | null,
): Promise<OwnerChange> {
  const rows = await db
    .select({ owner: userSettings.ownerUserId, googleId: userSettings.googleId, email: userSettings.email })
    .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const row = rows[0]
  const stored = row?.owner ?? ''
  if (stored === userId) return 'same'

  if (stored === '') {
    // Installs that predate owner_user_id: the sign-in code stored the auth uid in
    // googleId (and the account email in email), so they are evidence of whose data
    // this is. A mismatch means a different account is signing in.
    const legacyId = trimmed(row?.googleId)
    const legacyEmail = trimmed(row?.email).toLowerCase()
    const foreign = legacyId
      ? legacyId !== userId
      : !!(legacyEmail && trimmed(email) && legacyEmail !== trimmed(email).toLowerCase())
    if (!foreign) {
      await db.insert(userSettings)
        .values({ id: 1, ownerUserId: userId })
        .onConflictDoUpdate({ target: userSettings.id, set: { ownerUserId: userId } })
      // A push queued while anonymous would overwrite this account's existing
      // backup with pre-sign-in data; the pull merges that data in instead.
      cancelPendingPush()
      return 'claimed'
    }
  }

  // Different account: nothing queued for the previous user may be uploaded, and
  // their note reminders must stop firing on this device.
  cancelPendingPush()
  const reminderNotes = await db.select({ id: notesTable.id }).from(notesTable).where(isNotNull(notesTable.reminderAt))
  await db.transaction((tx) => {
    for (const table of STUDY_TABLES) {
      if (table === userSettings) continue
      tx.delete(table).run()
    }
    tx.delete(noteLabelAssignments).run()
    tx.delete(noteLabels).run()
    tx.delete(notesTable).run()
    tx.insert(userSettings)
      .values({ id: 1, ...USER_SETTINGS_RESET, ownerUserId: userId })
      .onConflictDoUpdate({ target: userSettings.id, set: { ...USER_SETTINGS_RESET, ownerUserId: userId } })
      .run()
  })
  if (reminderNotes.length > 0) {
    // Loaded lazily: the notifications module pulls in expo-constants, which the
    // sync engine (and its tests) must not depend on at import time.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { cancelNoteReminder } = require('./notifications') as typeof import('./notifications')
      for (const n of reminderNotes) await cancelNoteReminder(n.id).catch(() => undefined)
    } catch (e) {
      console.warn('[sync] could not cancel the previous account note reminders (non-fatal):', e)
    }
  }
  // The previous person's analytics consent (and held id) must not carry over.
  resetAnalytics()
  // Nor their Full Access (the cache columns were reset above).
  forgetPremiumState()
  invalidate('')
  scheduleWebPersist()
  return 'switched'
}

// ── Pull / merge helpers ───────────────────────────────────────────────────────
// Remote rows carry the backup device's autoincrement ids; those must never be
// reused locally (they would collide with, or overwrite, different local rows).
function withoutId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row
  return rest
}

/** Sentinel-joined natural key so null/'' and 0 never alias each other. */
function naturalKey(...parts: unknown[]): string {
  return parts.map(p => (p === null || p === undefined ? '\u0000' : String(p))).join('\u0001')
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== '' && v !== '[]'

const requireNum = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`remote row: ${field} missing`)
  return v
}
const requireStr = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`remote row: ${field} missing`)
  return v
}

/** Runs one remote row's validation + insert; a malformed row is logged and skipped, never fatal. */
function skipBadRow(label: string, fn: () => void): void {
  try { fn() } catch (e) { console.warn(`[sync] ${label}: skipped a malformed remote row:`, e) }
}

const asRows = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

type Tx = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]

/**
 * Applies one user-curated entity (REPLACE or MERGE, decided by `write`) in its own
 * transaction, but only when the remote actually has rows for it (an empty/absent
 * remote list never touches local data). All-or-nothing: a throw rolls the entity
 * back to the local rows. Returns whether it was applied.
 */
async function applyCurated(
  db: DrizzleClient,
  label: string,
  remote: unknown[],
  write: (tx: Tx) => void,
): Promise<boolean> {
  if (remote.length === 0) return false
  try {
    await db.transaction((tx) => { write(tx) })
    return true
  } catch (e) {
    console.warn(`[sync] ${label} restore failed (local copy kept):`, e)
    return false
  }
}

const orderFocus = <T extends { listingSlug: string; priority: number; addedAt: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.priority - b.priority || a.addedAt - b.addedAt || a.listingSlug.localeCompare(b.listingSlug))

/** The settings object in this account's backup row, null when there is no backup yet. */
async function fetchBackupSettings(
  userId: string,
): Promise<Partial<typeof userSettings.$inferInsert> | null | 'unreadable'> {
  try {
    const { data, error } = await supabase
      .from('user_app_data').select('settings').eq('user_id', userId).limit(1).single()
    if (error) return (error as { code?: string }).code === 'PGRST116' ? null : 'unreadable'
    return (data?.settings as Partial<typeof userSettings.$inferInsert> | null | undefined) ?? null
  } catch (e) {
    console.warn('[sync] could not read the backup settings:', e)
    return 'unreadable'
  }
}

/** Consent columns to write on restore, plus the sensitive details to clear when the backup withdrew that consent. */
function resolveConsent(
  local: typeof userSettings.$inferSelect | undefined,
  remote: Partial<typeof userSettings.$inferInsert>,
  merging: boolean,
) {
  const snap = (r: Partial<typeof userSettings.$inferInsert> | undefined): ConsentSnapshot => ({
    ageBand: r?.ageBand ?? '',
    consentVersion: r?.consentVersion ?? '',
    consentedAt: r?.consentedAt ?? 0,
    guardianConsentAt: r?.guardianConsentAt ?? 0,
    sensitiveConsentAt: r?.sensitiveConsentAt ?? 0,
    sensitiveWithdrawnAt: r?.sensitiveWithdrawnAt ?? 0,
    analyticsOptIn: r?.analyticsOptIn ?? null,
    analyticsChoiceAt: r?.analyticsChoiceAt ?? 0,
  })
  const before = snap(local)
  const merged = mergeConsent(before, snap(remote), merging)
  const withdrawn = before.sensitiveConsentAt > 0 && merged.sensitiveConsentAt === 0
  return withdrawn ? { ...merged, ...SENSITIVE_CLEARED } : merged
}

async function markPullOk(db: DrizzleClient): Promise<void> {
  try {
    await db.insert(userSettings)
      .values({ id: 1, lastPullOkAt: Date.now() })
      .onConflictDoUpdate({ target: userSettings.id, set: { lastPullOkAt: Date.now() } })
  } catch (e) {
    console.warn('[sync] could not record pull completion (non-fatal):', e)
  }
}

// Pull user data from Supabase into the local DB — HYBRID restore:
//  - append-only LOGS (practice sessions, progress, question attempts, SRS) are
//    MERGED by natural key: local rows are never deleted, so work that has not
//    reached the cloud yet survives, and pulling twice is a no-op;
//  - user-CURATED entities (notes, labels, plan, focus, saved decks,
//    requirements, settings) are REPLACED by the remote copy when it has data,
//    so a delete made on another device propagates ...
//  - ... unless local edits are not in the cloud yet. The durable push_dirty_at
//    marker records that across reloads/offline: a dirty device pushes first, and
//    if that push fails every curated replace is skipped this pull (logs only).
//  - the first sign-in of an anonymous device ('claimed') MERGES curated data
//    into the existing backup instead of replacing it, then pushes the union.
// Pulls are serialized: two overlapping callers (web callback + auth listener)
// run one after the other instead of interleaving their reads and writes.
let pullChain: Promise<void> = Promise.resolve()

export function pullUserData(db: DrizzleClient): Promise<void> {
  const run = pullChain.then(() => pullUserDataOnce(db))
  pullChain = run.catch(() => undefined)
  return run
}

async function pullUserDataOnce(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const owner = await reconcileAccountOwner(db, user.id, user.email)

  // A device that has never completed a pull for this owner (anonymous -> first
  // sign-in, upgraded install, or a pull that never finished) MERGES curated data
  // into the backup. This is derived from durable state, not from the 'claimed'
  // return value, because the sign-in screens call reconcileAccountOwner themselves
  // first. Such a device must also NOT push before pulling: its local data may
  // pre-date the account and would overwrite the real backup.
  const stateRows = await db.select({ d: userSettings.pushDirtyAt, p: userSettings.lastPullOkAt })
    .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const merging = owner === 'claimed' || (stateRows[0]?.p ?? 0) === 0

  // Protect unsynced local edits (this process' queue AND the durable marker).
  let curatedSafe = true
  if (merging) {
    cancelPendingPush()
  } else {
    await flushPendingPush()
    const dirtyRows = await db.select({ d: userSettings.pushDirtyAt }).from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    if ((dirtyRows[0]?.d ?? 0) > 0) {
      curatedSafe = await pushUserData(db).catch(() => false)
      if (!curatedSafe) console.warn('[sync] unsynced local edits could not be pushed: keeping local curated data this pull')
    }
  }

  const { data, error } = await supabase
    .from('user_app_data')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  // PGRST116 = no row: a legitimate "no backup yet", not a failure.
  if (error && (error as { code?: string }).code !== 'PGRST116') return
  if (!data) {
    await markPullOk(db)
    return
  }

  // 1) CRITICAL — restore settings + focus listings independently and resiliently.
  //    These two gate returning-user detection (skip onboarding), so a bad row in
  //    ANY other section must not roll them back via a shared transaction. Each is
  //    its own autocommit/transaction + try/catch, and only known columns are
  //    written so an older backup's extra/changed fields can't cause a "no such
  //    column" failure. Remote replaces local, but an empty remote value never
  //    blanks a value the user already has on this device.
  const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert> | null
  if (remoteSettings && curatedSafe) {
    try {
      const localRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const local = localRows[0]
      const str = (remote: string | undefined | null, localVal: string | undefined | null, dflt: string) =>
        nonEmpty(remote) ? remote : (localVal && localVal !== '[]' ? localVal : (remote ?? dflt))
      // Consent (P1b): each part is merged on its own (utils/consent.ts mergeConsent)
      // and an older backup never blanks it. A withdrawal of the sensitive-data
      // consent made on another device, if newer than this device's grant, also
      // clears the details here, so no device keeps them without consent.
      const consentValues = resolveConsent(local, remoteSettings, merging)
      const settingsValues = {
        id: 1,
        googleId: str(remoteSettings.googleId, local?.googleId, ''),
        email: str(remoteSettings.email, local?.email, ''),
        fullName: str(remoteSettings.fullName, local?.fullName, ''),
        school: str(remoteSettings.school, local?.school, ''),
        gradeLevel: remoteSettings.gradeLevel ?? local?.gradeLevel ?? null,
        selectedListingSlug: str(remoteSettings.selectedListingSlug, local?.selectedListingSlug, ''),
        lastSyncedAt: 0,  // force catalog re-sync on next launch
        notificationsEnabled: remoteSettings.notificationsEnabled ?? local?.notificationsEnabled ?? true,
        focusModeEnabled: remoteSettings.focusModeEnabled ?? local?.focusModeEnabled ?? true,
        dailyReminderHour: remoteSettings.dailyReminderHour ?? local?.dailyReminderHour ?? 9,
        weeklySummaryEnabled: remoteSettings.weeklySummaryEnabled ?? local?.weeklySummaryEnabled ?? true,
        targetExams: str(remoteSettings.targetExams, local?.targetExams, '[]'),
        targetCourses: str(remoteSettings.targetCourses, local?.targetCourses, '[]'),
        schoolRegion: str(remoteSettings.schoolRegion, local?.schoolRegion, ''),
        ...consentValues,
      }
      await db.insert(userSettings)
        .values(settingsValues)
        .onConflictDoUpdate({ target: userSettings.id, set: settingsValues })
    } catch (e) {
      console.warn('[sync] settings restore failed:', e)
    }
  }

  // Focus: REPLACE (or, when claiming, UNION by slug), then renumber priorities
  // 0..n-1 in a deterministic order (priority, addedAt, slug) so the primary
  // listing (syncPrimaryListing: lowest priority) is stable across devices.
  const remoteFocus = asRows<typeof focusListings.$inferInsert>(data.focus_listings)
  if (curatedSafe) {
    await applyCurated(db, 'focus', remoteFocus, (tx) => {
      const remoteBySlug = new Map<string, { listingSlug: string; priority: number; addedAt: number }>()
      for (const r of remoteFocus) {
        const slug = requireStr(r?.listingSlug, 'listingSlug')
        if (!remoteBySlug.has(slug)) remoteBySlug.set(slug, { listingSlug: slug, priority: Number(r.priority) || 0, addedAt: Number(r.addedAt) || 0 })
      }
      let ordered = orderFocus([...remoteBySlug.values()])
      if (merging) {
        const localOnly = orderFocus(tx.select().from(focusListings).all().filter(l => !remoteBySlug.has(l.listingSlug)))
        ordered = [...ordered, ...localOnly]
      }
      tx.delete(focusListings).run()
      ordered.forEach((r, i) => { tx.insert(focusListings).values({ listingSlug: r.listingSlug, addedAt: r.addedAt, priority: i }).run() })
    })
  }

  // 2) BEST-EFFORT — everything below is logged but never blocks sign-in or the
  //    critical restore above. Old remote payloads may contain a saved_listings
  //    field — it is simply ignored (field removed from app).

  // 2a) Append-only logs: MERGE by natural key. The "already have it" sets are read
  //     INSIDE the transaction so nothing can slip in between read and write.
  //     Optional tables (absent in older schemas) default to [] and never block it.
  try {
    const sessionKey = (r: { completedAt: number; listingSlug?: string | null; topicId?: string | null; deckId?: string | null; subtest?: string | null; score?: number | null; total?: number | null }) =>
      naturalKey(r.completedAt, r.listingSlug ?? '', r.topicId ?? '', r.deckId ?? '', r.subtest ?? null, r.score ?? 0, r.total ?? 0)
    const progressKey = (r: { flashcardId: string; answeredAt: number; correct: unknown }) =>
      naturalKey(r.flashcardId, r.answeredAt, r.correct ? 1 : 0)
    const attemptKey = (r: { sessionKey: number; questionId: string; answeredAt: number }) =>
      naturalKey(r.sessionKey, r.questionId, r.answeredAt)
    const optional = <T>(read: () => T[]): T[] => { try { return read() } catch { return [] } }

    await db.transaction((tx) => {
      const seenSessions = new Set(tx.select().from(practiceSessions).all().map(sessionKey))
      const seenProgress = new Set(tx.select().from(userProgress).all().map(progressKey))
      const seenAttempts = new Set(optional(() => tx.select().from(questionAttempts).all()).map(attemptKey))
      const srsByCard = new Map(optional(() => tx.select().from(flashcardSrs).all()).map(r => [r.flashcardId, r]))

      for (const row of asRows<typeof practiceSessions.$inferInsert>(data.practice_sessions)) {
        skipBadRow('practice_sessions', () => {
          requireNum(row?.completedAt, 'completedAt')
          const k = sessionKey(row)
          if (seenSessions.has(k)) return
          tx.insert(practiceSessions).values(withoutId(row)).run()
          seenSessions.add(k)
        })
      }

      for (const row of asRows<typeof userProgress.$inferInsert>(data.user_progress)) {
        skipBadRow('user_progress', () => {
          requireStr(row?.flashcardId, 'flashcardId')
          requireNum(row.answeredAt, 'answeredAt')
          const k = progressKey(row)
          if (seenProgress.has(k)) return
          tx.insert(userProgress).values(withoutId(row)).run()
          seenProgress.add(k)
        })
      }

      for (const row of asRows<typeof questionAttempts.$inferInsert>(data.question_attempts)) {
        skipBadRow('question_attempts', () => {
          requireStr(row?.questionId, 'questionId')
          requireNum(row.answeredAt, 'answeredAt')
          requireNum(row.correctIndex, 'correctIndex')
          const k = attemptKey(row)
          if (seenAttempts.has(k)) return
          tx.insert(questionAttempts).values(withoutId(row)).run()
          seenAttempts.add(k)
        })
      }

      // One SRS row per card: the later last_reviewed_at wins.
      for (const row of asRows<typeof flashcardSrs.$inferInsert>(data.flashcard_srs)) {
        skipBadRow('flashcard_srs', () => {
          requireStr(row?.flashcardId, 'flashcardId')
          const mine = srsByCard.get(row.flashcardId)
          if (!mine) {
            tx.insert(flashcardSrs).values(row).onConflictDoNothing().run()
          } else if ((row.lastReviewedAt ?? 0) > (mine.lastReviewedAt ?? 0)) {
            tx.update(flashcardSrs).set(row).where(eq(flashcardSrs.flashcardId, row.flashcardId)).run()
          }
        })
      }
    })
  } catch (e) {
    console.warn('[sync] log merge failed (non-fatal):', e)
  }

  // The merge can push question_attempts past the retention cap that
  // useRecordAttempts enforces on write; keep the 5000 newest.
  try { await pruneOldAttempts(db) } catch (e) { console.warn('[sync] attempts prune failed (non-fatal):', e) }

  // 2b) User-curated entities: REPLACE when the remote has data (UNION when claiming).
  if (curatedSafe) {
    const remoteDecks = asRows<typeof savedDecks.$inferInsert>(data.saved_decks)
    await applyCurated(db, 'saved_decks', remoteDecks, (tx) => {
      if (!merging) tx.delete(savedDecks).run()
      for (const row of remoteDecks) tx.insert(savedDecks).values(row).onConflictDoNothing().run()
    })

    const remoteReqs = asRows<typeof userRequirements.$inferInsert>(data.user_requirements)
    await applyCurated(db, 'user_requirements', remoteReqs, (tx) => {
      if (!merging) tx.delete(userRequirements).run()
      for (const row of remoteReqs) {
        tx.insert(userRequirements)
          .values({ listingSlug: row.listingSlug, requirementIndex: row.requirementIndex, acquiredAt: row.acquiredAt })
          .onConflictDoNothing()
          .run()
      }
    })

    const planKey = (r: { planDate: string; kind: string; refId?: string | null }) => naturalKey(r.planDate, r.kind, r.refId ?? '')
    const remotePlan = asRows<typeof studyPlanItems.$inferInsert>(data.study_plan_items)
    await applyCurated(db, 'study_plan_items', remotePlan, (tx) => {
      if (!merging) {
        tx.delete(studyPlanItems).run()
        for (const row of remotePlan) tx.insert(studyPlanItems).values(withoutId(row)).run()
        return
      }
      const local = new Map(tx.select().from(studyPlanItems).all().map(r => [planKey(r), r]))
      for (const row of remotePlan) {
        const mine = local.get(planKey(row))
        if (!mine) tx.insert(studyPlanItems).values(withoutId(row)).run()
        else if (mine.completedAt == null && row.completedAt != null) {
          tx.update(studyPlanItems).set({ completedAt: row.completedAt }).where(eq(studyPlanItems.id, mine.id)).run()
        }
      }
    })

    const remoteNotes = asRows<typeof notesTable.$inferInsert>(data.notes)
    const remoteLabels = asRows<typeof noteLabels.$inferInsert>(data.note_labels)
    const remoteAssigns = asRows<typeof noteLabelAssignments.$inferInsert>(data.note_label_assignments)
    let touched = false
    if (!merging) {
      const notesReplaced = await applyCurated(db, 'notes', remoteNotes, (tx) => {
        tx.delete(notesTable).run()
        for (const row of remoteNotes) tx.insert(notesTable).values(row).run()
      })
      const labelsReplaced = await applyCurated(db, 'note_labels', remoteLabels, (tx) => {
        tx.delete(noteLabels).run()
        for (const row of remoteLabels) tx.insert(noteLabels).values(row).run()
      })
      const assignsReplaced = await applyCurated(db, 'note_label_assignments', remoteAssigns, (tx) => {
        tx.delete(noteLabelAssignments).run()
        for (const row of remoteAssigns) tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()
      })
      touched = notesReplaced || labelsReplaced || assignsReplaced
    } else {
      // Union: the anonymous notes/labels stay next to the account's. A local label
      // with the same NAME as a remote one is folded into it (its assignments move).
      touched = await applyCurated(db, 'notes', [...remoteNotes, ...remoteLabels, ...remoteAssigns], (tx) => {
        const localNotes = new Map(tx.select().from(notesTable).all().map(n => [n.id, n]))
        for (const row of remoteNotes) {
          const mine = localNotes.get(row.id as string)
          if (!mine) tx.insert(notesTable).values(row).run()
          else if ((row.updatedAt ?? 0) > mine.updatedAt) tx.update(notesTable).set(row).where(eq(notesTable.id, row.id as string)).run()
        }

        const remoteLabelByName = new Map(remoteLabels.map(l => [l.name, l]))
        for (const l of tx.select().from(noteLabels).all()) {
          const twin = remoteLabelByName.get(l.name)
          if (twin && twin.id !== l.id) {
            const moved = tx.select().from(noteLabelAssignments).all().filter(a => a.labelId === l.id)
            tx.delete(noteLabelAssignments).where(eq(noteLabelAssignments.labelId, l.id)).run()
            tx.delete(noteLabels).where(eq(noteLabels.id, l.id)).run()
            // the twin row is inserted below; remembered assignments are re-added after it
            for (const a of moved) remoteAssigns.push({ noteId: a.noteId, labelId: twin.id as string })
          }
        }
        for (const row of remoteLabels) tx.insert(noteLabels).values(row).onConflictDoNothing().run()
        for (const row of remoteAssigns) tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()
      })
    }
    if (touched) {
      // Drop assignments left pointing at a note/label that no longer exists.
      try {
        await db.run(sql`DELETE FROM note_label_assignments
          WHERE note_id NOT IN (SELECT id FROM notes) OR label_id NOT IN (SELECT id FROM note_labels)`)
      } catch (e) {
        console.warn('[sync] dangling label assignment cleanup failed (non-fatal):', e)
      }
    }
  }

  await markPullOk(db)

  // Screens cached pre-sync numbers (zeros on a fresh sign-in): drop them so
  // home/progress/practice refetch the restored data.
  invalidate('')
  scheduleWebPersist()

  // First sign-in with an existing backup: the merged union is the new truth, so
  // back it up now (the backup row still holds only the pre-merge copy).
  if (merging) {
    try { await pushUserData(db) } catch (e) { console.warn('[sync] post-merge push failed (non-fatal):', e) }
  }
}

/**
 * Safety margin subtracted from the stored sync cursor. A row committed on the
 * server while a pull is in flight (or with a slightly skewed clock) can carry an
 * updated_at between "when the first query ran" and "when the cursor was written";
 * with the cursor at the post-fetch time such a row would never be pulled again.
 * Re-pulling a minute of overlap is idempotent (upserts), so it only costs a few rows.
 */
export const SYNC_CURSOR_MARGIN_MS = 60_000

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  markSyncStart()
  // Captured BEFORE the first query: the cursor written at the end is this minus the margin.
  const syncStartedAt = Date.now()
  try {
    const [settingsRows, focusRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select().from(focusListings).orderBy(asc(focusListings.priority)),
    ])
    const settings = settingsRows[0]
    if (!settings) return

    let slugs = focusRows.map(r => r.listingSlug)
    if (slugs.length === 0 && settings.selectedListingSlug) slugs = [settings.selectedListingSlug]

    // School-level focus entries ("school:<id>") have no content of their own —
    // no flashcard is tagged with a school pseudo-slug, and every consumer of
    // selectedListingSlug (profile title, recommended topics)
    // expects a CONTENT slug. Map them to 'general-cet' (the shared general
    // entrance practice) for both the per-slug flashcards pull and the cursor
    // write below; otherwise a school-only-focus user syncs ZERO review cards
    // and their primary slug breaks downstream screens.
    const contentSlugs = [...new Set(slugs.map(s => (isSchoolFocusSlug(s) ? 'general-cet' : s)))]
    // NOTE: we intentionally do NOT early-return when slugs.length === 0.
    // Only the per-slug flashcards pull genuinely needs focus slugs; every
    // catalog table (listings, subjects/topics, upcat, career_*, university/
    // course/taxonomy, blueprints, admissions) is public and
    // must ALWAYS mirror so a focus-less session (anonymous web visitor, or a
    // launch that fires before pullUserData restores focus on sign-in) still
    // populates Courses/Destinations. The flashcards pull below is the only
    // step gated on slugs.length > 0.

    const needsHeal = (settings.syncRev ?? 0) < SYNC_REV
    const since = needsHeal || settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()

    const [listingsRes, subjectsRes, topicsRes, admissionsUpdatesRes] = await Promise.all([
      supabase.from('listings')
        .select('id,slug,title,type,status,exam_date,region,description,requirements,coverage,provider,external_url,deadline,grant_amount,province,city,scope,is_verified,income_ceiling,gwa_requirement,monthly_stipend,service_obligation_years,has_entrance_exam,application_window,scholarship_meta,results_date,target_courses')
        .gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
      supabase.from('admissions_updates')
        .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
        .gt('updated_at', since),
    ])

    const [upcatPassagesRes, upcatQuestionsRows, upcatFactsRes, upcatCutoffsRes] = await Promise.all([
      // Full pull: upcat_passages has no updated_at cursor (immutable reference data, ~23 rows). TODO: add updated_at + incremental cursor if passage volume grows across exam years.
      supabase.from('upcat_passages').select('set_id,subtest,passage_text'),
      fetchUpcatQuestionsRows(since),
      supabase.from('upcat_facts')
        .select('id,topic,question,answer,source,valid_year,updated_at')
        .gt('updated_at', since),
      supabase.from('upcat_cutoffs').select('id,campus,program,cutoff,year,is_estimate,updated_at')
        .gt('updated_at', since),
    ])

    // ── Epic D: Career tables ────────────────────────────────────────────────
    // All tables now use incremental cursor via updated_at
    const [
      careerCoursesRes, careerCountriesRes, careerProgramsRes, aiCareerImpactRes,
      careerDestinationsRes, careerFactsRes,
    ] = await Promise.all([
      supabase.from('career_courses')
        .select('course_id,name,cluster,career_tag,demand,board_exam,board_exam_name,duration_years,top_countries,summary,student_tip,ai_note,updated_at')
        .gt('updated_at', since),
      supabase.from('career_countries')
        .select('code,name,region,immigration_system,why_demand,language_required,pr_pathway,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('career_programs')
        .select('id,name,country_region,courses_covered,managing_body,slots,requirements,immigration_outcome,website,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('ai_career_impact')
        .select('course_id,course_name,cluster,board_exam,board_exam_name,automation_risk_low,automation_risk_high,ai_safety_score,ai_safety_label,color_code,what_ai_takes_over,what_stays_human,new_jobs_emerging,skills_to_develop,career_outlook_2030,key_stat,key_source,key_quote,quote_by,ph_advantage,ph_notes,kuya_baw_summary,last_updated,updated_at')
        .gt('updated_at', since),
      supabase.from('career_destinations')
        .select('id,course_id,country,demand_rating,salary_min,salary_max,salary_local,salary_type,visa_pathway,pr_pathway,credential,licensing_exam,language_required,timeline_months,program_name,specializations,notes,saturation_warning,source,updated_at')
        .gt('updated_at', since),
      supabase.from('career_facts')
        .select('id,course_id,query_type,course_name,quick_answer,key_caveat,point_to,updated_at')
        .gt('updated_at', since),
    ])

    // ── Epic C: University / course tables ───────────────────────────────────
    // All tables now use incremental cursor via updated_at
    const [
      tertiarySchoolsRes, universityProfilesRes, courseSchoolRankingsRows,
      courseSchoolQualityRes, barResultsRes, courseTaxonomyMapRes,
    ] = await Promise.all([
      supabase.from('tertiary_schools')
        .select('id,name,acronym,region,province,city,type,is_suc,is_luc,deped_school_id,rank_in_province,updated_at')
        .gt('updated_at', since),
      supabase.from('university_profiles')
        .select('school_id,data_tier,institution_type,year_established,known_for_courses,prc_top_courses,ched_coe_cod,accreditation,entrance_exam_name,entrance_exam_acronym,testing_center_type,application_open,application_close,exam_month,estimated_passing_rate,estimated_slots,tuition_fee_range,free_tuition,academic_calendar,courses_offered,scholarships_offered,website_url,application_portal_url,facebook_url,exam_difficulty,notable_programs,prc_strong_boards,notes,data_confidence,requirements,qualifications,updated_at')
        .gt('updated_at', since),
      fetchAllPaginated((from, to) => supabase.from('course_school_rankings')
        .select('id,course_tab,course_name,rank,school_name,region,province,wilson_score,raw_pass_rate,total_examinees,total_passers,years_with_data,exam_periods,tertiary_school_id,updated_at')
        .gt('updated_at', since)
        .order('id')
        .range(from, to)),
      supabase.from('course_school_quality')
        .select('id,school_name,region,province,city,course_standardized,course_group,school_type,ched_coe_cod,quality_score,quality_tier,accreditations,has_prc_board,qs_subject_rank,data_confidence,tertiary_school_id,updated_at')
        .gt('updated_at', since),
      supabase.from('bar_results')
        .select('id,school_name,region,province,year,pass_rate,national_avg,sc_rank,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('course_taxonomy_map')
        .select('course_tab,career_course_id,label,kind,updated_at')
        .gt('updated_at', since),
    ])

    // ── Exam Blueprints (incremental cursor — local readers filter status) ────
    // NOTE: .eq('status','published') removed from blueprints so unpublish propagates.
    // Local readers (examBlueprints.ts getExamBlueprint / listPublishedBlueprintSlugs)
    // already filter status='published' in JS — verified in examBlueprints.ts:22,43.
    const [skillCatRes, blueprintsRes, sectionsRes, courseNotesRes] = await Promise.all([
      supabase.from('exam_skill_categories').select('name,requires_spatial_logic,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_blueprints').select('slug,name,acronym,total_items,total_time_minutes,has_guessing_penalty,guessing_penalty,section_blocked,scoring_note,mechanics_note,status,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_blueprint_sections').select('id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_course_notes').select('id,blueprint_slug,course_cluster,note,min_percentile,display_order,updated_at')
        .gt('updated_at', since),
    ])

    // Sections are replaced per blueprint (a section the admin removed leaves no row to
    // arrive in a delta pull, so upserting alone keeps it on devices forever). For every
    // blueprint touched by this pull (blueprint row or any of its sections changed) fetch
    // ALL of its sections, so a partial delta can never delete the untouched ones. If that
    // read fails, fall back to upserting the delta and keep local sections (never delete
    // on an unreliable read). The read is paged (a truncated read must not delete the
    // rest), and a slug is only replaced when the read returned at least one row for it:
    // an empty result can be the admin's non-atomic delete-then-insert window, and a
    // blueprint with no sections is not a state worth wiping a device to match.
    const changedBlueprintSlugs = [...new Set<string>([
      ...(blueprintsRes.data ?? []).map((r: any) => r.slug as string),
      ...(sectionsRes.data ?? []).map((r: any) => r.blueprint_slug as string),
    ].filter(Boolean))]
    let fullSectionRows: any[] | null = null
    if (changedBlueprintSlugs.length > 0) {
      try {
        fullSectionRows = await fetchAllPaginated((from, to) => supabase.from('exam_blueprint_sections')
          .select('id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order,updated_at')
          .in('blueprint_slug', changedBlueprintSlugs)
          .order('id')
          .range(from, to))
      } catch (err) {
        console.warn('[sync] exam_blueprint_sections full fetch failed — keeping local sections:', err)
      }
    }
    const replaceSectionSlugs = fullSectionRows
      ? changedBlueprintSlugs.filter(slug => fullSectionRows!.some(r => r.blueprint_slug === slug))
      : []

    // Per-slug flashcards pull — the ONLY step that genuinely needs focus slugs.
    // Skipped entirely for focus-less sessions; the catalog above still synced.
    // Uses contentSlugs (school: mapped to general-cet) so school-focus users
    // actually receive their review deck.
    const allCards = await fetchFlashcardsForSlugs(contentSlugs, since)

    // Unpublished / deleted questions, flashcards and topics (migration 065 hides
    // them from the pulls above). Fetched AFTER the pulls so it reflects a state no
    // older than theirs, and applied in the cursor transaction: a failed page throws
    // here and the cursor stays put. null = old server without the feed.
    const statusFeed = await fetchContentStatusFeed(since)

    // ── Tx 1: listings + admissions_updates ──────────────────────────────────
    // (Cursor write is intentionally LAST so an interrupted sync re-pulls next launch)
    await db.transaction((tx) => {
      batchUpsert(tx, listings, (listingsRes.data ?? []).map((row) => {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        const deadline = row.deadline ? new Date(row.deadline).getTime() : null
        return {
          id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status,
          examDate, region: row.region ?? '', description: row.description ?? '',
          requirements: JSON.stringify(row.requirements ?? []), coverage: row.coverage ?? '',
          provider: row.provider ?? '', externalUrl: row.external_url ?? '', deadline,
          grantAmount: row.grant_amount != null ? String(row.grant_amount) : '',
          province: row.province ?? null,
          city: row.city ?? null,
          scope: row.scope ?? 'national',
          isVerified: !!row.is_verified,
          incomeCeiling: row.income_ceiling ?? null,
          gwaRequirement: row.gwa_requirement ?? null,
          monthlyStipend: row.monthly_stipend ?? null,
          serviceObligationYears: row.service_obligation_years ?? null,
          hasEntranceExam: !!row.has_entrance_exam,
          applicationWindow: row.application_window ?? null,
          scholarshipMeta: JSON.stringify(row.scholarship_meta ?? {}),
          resultsDate: row.results_date ? new Date(row.results_date).getTime() : null,
          targetCourses: JSON.stringify(row.target_courses ?? []),
        }
      }), listings.id)

      batchUpsert(tx, admissionsUpdates, (admissionsUpdatesRes.data ?? []).map((row) => ({
        id: row.id,
        reportDate: row.report_date ?? null,
        severity: row.severity,
        schoolSlug: row.school_slug ?? null,
        schoolName: row.school_name ?? null,
        title: row.title,
        body: row.body,
        actionRequired: row.action_required ?? null,
        eventDate: row.event_date ?? null,
        eventType: row.event_type ?? null,
        sources: JSON.stringify(row.sources ?? []),
        verified: !!row.verified,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), admissionsUpdates.id)
    })

    // Yield JS thread between transactions so the UI stays responsive
    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 2: subjects + topics + flashcards ──────────────────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, subjects, (subjectsRes.data ?? []).map((row) => (
        { id: row.id, name: row.name }
      )), subjects.id)

      batchUpsert(tx, topics, (topicsRes.data ?? []).map((row) => (
        { id: row.id, name: row.name, subjectId: row.subject_id, status: row.status }
      )), topics.id)

      // Rows in one multi-row .values() batch must share an identical column
      // set (batchUpsert derives the on-conflict update set from the row keys),
      // so cards are GROUPED by whether Supabase has ai_* fields and upserted
      // as two batches. This preserves the per-row semantics exactly.
      const cardsWithoutAi: (typeof flashcards.$inferInsert)[] = []
      const cardsWithAi: (typeof flashcards.$inferInsert)[] = []
      for (const row of allCards) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        const baseVals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []),
          options: JSON.stringify(row.options ?? []),
          correctAnswerIndex: row.correct_answer_index ?? null,
          remoteUpdatedAt,
          // status synced so unpublished cards propagate to device (local readers filter published)
          status: (row as any).status ?? 'published',
          optionExplanations: JSON.stringify((row as any).option_explanations ?? []),
          strategyTip: (row as any).strategy_tip ?? '',
          // Absent entirely on the legacy-column fallback (pre-migration-054
          // Supabase) — ?? null degrades to "no figure" rather than throwing.
          imageUrl: (row as any).image_url ?? null,
          imageAlt: (row as any).image_alt ?? null,
          imageWidth: (row as any).image_width ?? null,
          imageHeight: (row as any).image_height ?? null,
        }

        // Only include ai_* fields when Supabase actually has them. This preserves
        // local Gemma work when Supabase hasn't been enhanced yet (fixes the
        // sync-wipe bug where every re-sync used to null these out).
        const r = row as any
        if (r.ai_enhanced_at) {
          cardsWithAi.push({
            ...baseVals,
            aiOptions: r.ai_options ? JSON.stringify(r.ai_options) : null,
            aiCorrectIndex: r.ai_correct_index ?? null,
            aiExplanation: r.ai_explanation ?? null,
            aiEnhancedAt: new Date(r.ai_enhanced_at).getTime(),
          })
        } else {
          cardsWithoutAi.push(baseVals)
        }
      }
      batchUpsert(tx, flashcards, cardsWithoutAi, flashcards.id)  // ai_* untouched on conflict
      batchUpsert(tx, flashcards, cardsWithAi, flashcards.id)     // ai_* overwritten from Supabase
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 3: upcat passages / questions / facts / cutoffs ────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, upcatPassages, (upcatPassagesRes.data ?? []).map((row) => (
        { setId: row.set_id, subtest: row.subtest, passageText: row.passage_text }
      )), upcatPassages.setId)

      batchUpsert(tx, upcatQuestions, upcatQuestionsRows.map((row) => ({
        questionId: row.question_id, subtest: row.subtest,
        mainSubject: row.main_subject ?? null, topic: row.topic ?? null, subtopic: row.subtopic ?? null,
        questionFormat: row.question_format ?? null, cognitiveLevel: row.cognitive_level ?? null,
        difficulty: row.difficulty ?? null, curriculumAlignment: row.curriculum_alignment ?? null,
        questionText: row.question_text,
        options: JSON.stringify(row.options ?? []),
        correctIndex: row.correct_index, explanation: row.explanation,
        setId: row.set_id ?? null, setPosition: row.set_position ?? null,
        hasVisual: !!row.has_visual, status: row.status,
        skillCategory: row.skill_category ?? null,
        optionExplanations: JSON.stringify((row as any).option_explanations ?? []),
        strategyTip: (row as any).strategy_tip ?? '',
        // Absent entirely on the legacy-column fallback (pre-migration-054
        // Supabase) — ?? null degrades to "no figure" rather than throwing.
        imageUrl: (row as any).image_url ?? null,
        imageAlt: (row as any).image_alt ?? null,
        imageWidth: (row as any).image_width ?? null,
        imageHeight: (row as any).image_height ?? null,
        remoteUpdatedAt: new Date(row.updated_at).getTime(),
      })), upcatQuestions.questionId)

      batchUpsert(tx, upcatFacts, (upcatFactsRes.data ?? []).map((row) => ({
        id: row.id, topic: row.topic, question: row.question, answer: row.answer,
        source: row.source ?? null, validYear: row.valid_year ?? null,
        remoteUpdatedAt: new Date(row.updated_at).getTime(),
      })), upcatFacts.id)

      batchUpsert(tx, upcatCutoffs, (upcatCutoffsRes.data ?? []).map((row) => ({
        id: row.id, campus: row.campus, program: row.program ?? null,
        cutoff: row.cutoff, year: row.year ?? null, isEstimate: !!row.is_estimate,
      })), upcatCutoffs.id)
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 4: career tables ───────────────────────────────────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, careerCourses, (careerCoursesRes.data ?? []).map((row) => ({
        courseId: row.course_id, name: row.name ?? null, cluster: row.cluster ?? null,
        careerTag: row.career_tag ?? null, demand: row.demand ?? null,
        boardExam: !!row.board_exam, boardExamName: row.board_exam_name ?? null,
        durationYears: row.duration_years ?? null,
        topCountries: JSON.stringify(row.top_countries ?? []),
        summary: row.summary ?? null, studentTip: row.student_tip ?? null,
        aiNote: row.ai_note ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerCourses.courseId)

      batchUpsert(tx, careerCountries, (careerCountriesRes.data ?? []).map((row) => ({
        code: row.code, name: row.name ?? null, region: row.region ?? null,
        immigrationSystem: row.immigration_system ?? null, whyDemand: row.why_demand ?? null,
        languageRequired: row.language_required ?? null, prPathway: row.pr_pathway ?? null,
        notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerCountries.code)

      batchUpsert(tx, careerPrograms, (careerProgramsRes.data ?? []).map((row) => ({
        id: row.id, name: row.name ?? null, countryRegion: row.country_region ?? null,
        coursesCovered: JSON.stringify(row.courses_covered ?? []),
        managingBody: row.managing_body ?? null, slots: row.slots ?? null,
        requirements: row.requirements ?? null, immigrationOutcome: row.immigration_outcome ?? null,
        website: row.website ?? null, notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerPrograms.id)

      batchUpsert(tx, aiCareerImpact, (aiCareerImpactRes.data ?? []).map((row) => ({
        courseId: row.course_id, courseName: row.course_name ?? null,
        cluster: row.cluster ?? null,
        boardExam: !!row.board_exam, boardExamName: row.board_exam_name ?? null,
        automationRiskLow: row.automation_risk_low ?? null,
        automationRiskHigh: row.automation_risk_high ?? null,
        aiSafetyScore: row.ai_safety_score ?? null, aiSafetyLabel: row.ai_safety_label ?? null,
        colorCode: row.color_code ?? null,
        whatAiTakesOver: JSON.stringify(row.what_ai_takes_over ?? []),
        whatStaysHuman: JSON.stringify(row.what_stays_human ?? []),
        newJobsEmerging: JSON.stringify(row.new_jobs_emerging ?? []),
        skillsToDevelop: JSON.stringify(row.skills_to_develop ?? []),
        careerOutlook2030: row.career_outlook_2030 ?? null,
        keyStat: row.key_stat ?? null, keySource: row.key_source ?? null,
        keyQuote: row.key_quote ?? null, quoteBy: row.quote_by ?? null,
        phAdvantage: row.ph_advantage ?? null, phNotes: row.ph_notes ?? null,
        kuyaBawSummary: row.kuya_baw_summary ?? null, lastUpdated: row.last_updated ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), aiCareerImpact.courseId)

      batchUpsert(tx, careerDestinations, (careerDestinationsRes.data ?? []).map((row) => ({
        id: row.id, courseId: row.course_id ?? null, country: row.country ?? null,
        demandRating: row.demand_rating ?? null,
        salaryMin: row.salary_min ?? null, salaryMax: row.salary_max ?? null,
        salaryLocal: row.salary_local ?? null, salaryType: row.salary_type ?? null,
        visaPathway: row.visa_pathway ?? null, prPathway: row.pr_pathway ?? null,
        credential: row.credential ?? null, licensingExam: row.licensing_exam ?? null,
        languageRequired: row.language_required ?? null,
        timelineMonths: row.timeline_months ?? null,
        programName: row.program_name ?? null,
        specializations: JSON.stringify(row.specializations ?? []),
        notes: row.notes ?? null, saturationWarning: row.saturation_warning ?? null,
        source: row.source ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerDestinations.id)

      batchUpsert(tx, careerFacts, (careerFactsRes.data ?? []).map((row) => ({
        id: row.id, courseId: row.course_id ?? null, queryType: row.query_type ?? null,
        courseName: row.course_name ?? null, quickAnswer: row.quick_answer ?? null,
        keyCaveat: row.key_caveat ?? null, pointTo: row.point_to ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerFacts.id)
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 5a: university tables (schools + profiles) ─────────────────────────
    // The university mirror is the biggest write of the sync (~727 schools +
    // ~727 wide profile rows + >1000 rankings). It's split across two
    // transactions (5a/5b) with a JS-thread yield between them so the UI stays
    // responsive — drizzle sqlite transaction callbacks are synchronous, so a
    // yield INSIDE one transaction isn't possible.
    await db.transaction((tx) => {
      batchUpsert(tx, tertiarySchools, (tertiarySchoolsRes.data ?? []).map((row) => ({
        id: row.id, name: row.name, acronym: row.acronym ?? null,
        region: row.region ?? null, province: row.province ?? null, city: row.city ?? null,
        type: row.type ?? null,
        isSuc: !!row.is_suc, isLuc: !!row.is_luc,
        depedSchoolId: row.deped_school_id ?? null,
        rankInProvince: row.rank_in_province ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), tertiarySchools.id)

      batchUpsert(tx, universityProfiles, (universityProfilesRes.data ?? []).map((row) => ({
        schoolId: row.school_id, dataTier: row.data_tier ?? null,
        institutionType: row.institution_type ?? null, yearEstablished: row.year_established ?? null,
        knownForCourses: JSON.stringify(row.known_for_courses ?? []),
        prcTopCourses: JSON.stringify(row.prc_top_courses ?? []),
        chedCoeCod: row.ched_coe_cod ?? null, accreditation: row.accreditation ?? null,
        entranceExamName: row.entrance_exam_name ?? null, entranceExamAcronym: row.entrance_exam_acronym ?? null,
        testingCenterType: row.testing_center_type ?? null,
        applicationOpen: row.application_open ?? null, applicationClose: row.application_close ?? null,
        examMonth: row.exam_month ?? null,
        estimatedPassingRate: row.estimated_passing_rate ?? null, estimatedSlots: row.estimated_slots ?? null,
        tuitionFeeRange: row.tuition_fee_range ?? null,
        freeTuition: row.free_tuition != null ? !!row.free_tuition : null,
        academicCalendar: row.academic_calendar ?? null,
        coursesOffered: JSON.stringify(row.courses_offered ?? []),
        scholarshipsOffered: JSON.stringify(row.scholarships_offered ?? []),
        websiteUrl: row.website_url ?? null, applicationPortalUrl: row.application_portal_url ?? null,
        facebookUrl: row.facebook_url ?? null,
        examDifficulty: row.exam_difficulty ?? null,
        notablePrograms: JSON.stringify(row.notable_programs ?? []),
        prcStrongBoards: JSON.stringify(row.prc_strong_boards ?? []),
        notes: row.notes ?? null, dataConfidence: row.data_confidence ?? null,
        requirements: JSON.stringify(row.requirements ?? []),
        qualifications: JSON.stringify(row.qualifications ?? []),
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), universityProfiles.schoolId)
    })

    // Yield JS thread between the two university transactions (see Tx 5a note)
    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 5b: course tables (rankings / quality / bar / taxonomy) ────────────
    await db.transaction((tx) => {
      batchUpsert(tx, courseSchoolRankings, courseSchoolRankingsRows.map((row) => ({
        id: row.id, courseTab: row.course_tab, courseName: row.course_name ?? null,
        rank: row.rank ?? null, schoolName: row.school_name,
        region: row.region ?? null, province: row.province ?? null,
        wilsonScore: row.wilson_score ?? null, rawPassRate: row.raw_pass_rate ?? null,
        totalExaminees: row.total_examinees ?? null, totalPassers: row.total_passers ?? null,
        yearsWithData: row.years_with_data ?? null, examPeriods: row.exam_periods ?? null,
        tertiarySchoolId: row.tertiary_school_id ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), courseSchoolRankings.id)

      batchUpsert(tx, courseSchoolQuality, (courseSchoolQualityRes.data ?? []).map((row) => ({
        id: row.id, schoolName: row.school_name,
        region: row.region ?? null, province: row.province ?? null, city: row.city ?? null,
        courseStandardized: row.course_standardized ?? null, courseGroup: row.course_group ?? null,
        schoolType: row.school_type ?? null, chedCoeCod: row.ched_coe_cod ?? null,
        qualityScore: row.quality_score ?? null, qualityTier: row.quality_tier ?? null,
        accreditations: JSON.stringify(row.accreditations ?? []),
        hasPrcBoard: row.has_prc_board != null ? !!row.has_prc_board : null,
        qsSubjectRank: row.qs_subject_rank ?? null, dataConfidence: row.data_confidence ?? null,
        tertiarySchoolId: row.tertiary_school_id ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), courseSchoolQuality.id)

      batchUpsert(tx, barResults, (barResultsRes.data ?? []).map((row) => ({
        id: row.id, schoolName: row.school_name,
        region: row.region ?? null, province: row.province ?? null,
        year: row.year ?? null,
        passRate: row.pass_rate ?? null, nationalAvg: row.national_avg ?? null,
        scRank: row.sc_rank ?? null, notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), barResults.id)

      batchUpsert(tx, courseTaxonomyMap, (courseTaxonomyMapRes.data ?? []).map((row) => ({
        courseTab: row.course_tab, careerCourseId: row.career_course_id ?? null,
        label: row.label ?? null, kind: row.kind ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), courseTaxonomyMap.courseTab)
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 6: blueprints + skill categories + course notes + cursor write ──────
    // Cursor (lastSyncedAt + syncRev) is written LAST so an interrupted sync
    // forces a full re-pull on the next launch.
    await db.transaction((tx) => {
      batchUpsert(tx, examSkillCategories, (skillCatRes.data ?? []).map((row) => (
        { name: row.name, requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0, remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null }
      )), examSkillCategories.name)

      batchUpsert(tx, examBlueprints, (blueprintsRes.data ?? []).map((row) => ({
        slug: row.slug, name: row.name, acronym: row.acronym ?? '',
        totalItems: row.total_items ?? 0, totalTimeMinutes: row.total_time_minutes ?? 0,
        hasGuessingPenalty: !!row.has_guessing_penalty, guessingPenalty: row.guessing_penalty ?? 0.25,
        sectionBlocked: !!row.section_blocked, scoringNote: row.scoring_note ?? '', mechanicsNote: row.mechanics_note ?? '',
        status: row.status ?? 'draft', displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examBlueprints.slug)

      if (replaceSectionSlugs.length > 0) {
        tx.delete(examBlueprintSections).where(inArray(examBlueprintSections.blueprintSlug, replaceSectionSlugs)).run()
      }
      batchUpsert(tx, examBlueprintSections, (fullSectionRows ?? sectionsRes.data ?? []).map((row: any) => ({
        id: row.id, blueprintSlug: row.blueprint_slug, name: row.name, skillCategory: row.skill_category ?? '',
        itemCount: row.item_count ?? 0, timeMinutes: row.time_minutes ?? null,
        requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examBlueprintSections.id)

      batchUpsert(tx, examCourseNotes, (courseNotesRes.data ?? []).map((row) => ({
        id: row.id, blueprintSlug: row.blueprint_slug, courseCluster: row.course_cluster ?? 'all',
        note: row.note ?? '', minPercentile: row.min_percentile ?? null, displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examCourseNotes.id)

      if (statusFeed) applyContentStatusFeed(tx, statusFeed)

      // Cursor write LAST so an interrupted sync re-pulls next launch.
      // selectedListingSlug is only (re)written when we actually have a slug —
      // a focus-less session must not clobber it with undefined/empty. Uses
      // contentSlugs so a school-only focus stores 'general-cet' (a real
      // content slug) instead of the school pseudo-slug.
      const syncedAt = syncStartedAt - SYNC_CURSOR_MARGIN_MS
      if (contentSlugs.length > 0) {
        tx.insert(userSettings)
          .values({ id: 1, selectedListingSlug: contentSlugs[0]!, lastSyncedAt: syncedAt, syncRev: SYNC_REV })
          .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, selectedListingSlug: contentSlugs[0]!, syncRev: SYNC_REV } })
          .run()
      } else {
        tx.insert(userSettings)
          .values({ id: 1, lastSyncedAt: syncedAt, syncRev: SYNC_REV })
          .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, syncRev: SYNC_REV } })
          .run()
      }
    })

    // Invalidate all query caches so screens reflect fresh synced data
    invalidate('')

    // Schedule a web DB persist after sync (no-op on native)
    scheduleWebPersist()

    // Also push user data backup if signed in
    await pushUserData(db)

    // Retry queued question reports (best-effort, fire-and-forget — never
    // blocks launch; pushPendingReports swallows its own errors).
    void pushPendingReports(db)
  } catch (err) {
    console.error('[sync] error:', err)
    // Surface the failure to the UI (SyncErrorBanner) so the user sees a retry
    // affordance instead of silent stale/empty screens.
    markSyncError(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    markSyncDone()
  }
}
