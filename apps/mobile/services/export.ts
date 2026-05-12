import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import type { Database } from '@nozbe/watermelondb'
import type { UserSettings } from '../db/models/UserSettings'

export async function exportUserData(db: Database): Promise<void> {
  const settings = await db
    .get<UserSettings>('user_settings')
    .find('local')
    .catch(() => null)

  const payload = {
    selected_listing_slug: settings?.selectedListingSlug ?? '',
    last_synced_at: settings?.lastSyncedAt ?? 0,
    exported_at: new Date().toISOString(),
  }

  const dir = FileSystem.documentDirectory
  if (!dir) throw new Error('File system not available on this platform')
  const fileUri = `${dir}iskotify-export.json`
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Iskotify Data',
  })
}
