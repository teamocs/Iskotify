import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  userSettings,
  focusListings,
  savedListings,
  savedDecks,
  userProgress,
  practiceSessions,
} from '../db/schema'

export async function exportUserData(db: DrizzleClient): Promise<void> {
  const [settings, focus, saved, decks, progress, sessions] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    settings: settings[0] ?? null,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
  }

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')

  const dir = FileSystem.documentDirectory
  if (!dir) throw new Error('File system not available on this platform')
  const fileUri = `${dir}iskotify-export.json`
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  })

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Iskotify Data',
  })
}
