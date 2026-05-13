import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'

export async function exportUserData(db: DrizzleClient): Promise<void> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const settings = rows[0]

  const payload = {
    selected_listing_slug: settings?.selectedListingSlug ?? '',
    last_synced_at: settings?.lastSyncedAt ?? 0,
    exported_at: new Date().toISOString(),
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
