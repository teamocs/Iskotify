// Real adapters for syncDriveFolder: Google Drive (read-only, same service
// account as the Sheets sync) and the Supabase `question-media` bucket.
//
// Setup: share the knowledge-base Drive folder with the service account's
// client_email (Viewer) and set KB_DRIVE_FOLDER_ID to that folder's id.

import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DriveEntry, DriveGateway, MediaStore } from './syncDriveFolder'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
// Drive ids are URL-safe base64; validated because they are interpolated into
// the files.list query string.
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/
const MAX_DEPTH = 6
const MAX_ENTRIES = 5000

export const QUESTION_MEDIA_BUCKET = 'question-media'

export function createDriveGateway(credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON): DriveGateway {
  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(credentialsJson ?? '')
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing or malformed')
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })

  return {
    async listTree(rootId) {
      const out: DriveEntry[] = []
      const queue = [{ id: rootId, path: '', depth: 0 }]
      while (queue.length > 0) {
        const { id, path, depth } = queue.shift()!
        if (!DRIVE_ID.test(id)) throw new Error(`Invalid Drive folder id: ${id}`)
        let pageToken: string | undefined
        do {
          const res = await drive.files.list({
            q: `'${id}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, size)',
            pageSize: 1000,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          })
          for (const f of res.data.files ?? []) {
            if (!f.id || !f.name || !f.mimeType) continue
            if (f.mimeType === FOLDER_MIME) {
              if (depth < MAX_DEPTH) queue.push({ id: f.id, path: path ? `${path}/${f.name}` : f.name, depth: depth + 1 })
              continue
            }
            out.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              md5Checksum: f.md5Checksum ?? null,
              modifiedTime: f.modifiedTime ?? null,
              size: f.size ? Number(f.size) : null,
              path,
            })
            if (out.length > MAX_ENTRIES) throw new Error(`Drive folder has more than ${MAX_ENTRIES} files — narrow KB_DRIVE_FOLDER_ID`)
          }
          pageToken = res.data.nextPageToken ?? undefined
        } while (pageToken)
      }
      return out
    },

    async downloadText(entry) {
      if (entry.mimeType === SHEET_MIME) {
        // Exports the first sheet of a native Google Sheet.
        const res = await drive.files.export({ fileId: entry.id, mimeType: 'text/csv' }, { responseType: 'text' })
        return String(res.data)
      }
      const res = await drive.files.get(
        { fileId: entry.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'text' },
      )
      return String(res.data)
    },

    async downloadBytes(entry) {
      const res = await drive.files.get(
        { fileId: entry.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      )
      return Buffer.from(res.data as ArrayBuffer)
    },
  }
}

export function createMediaStore(db: SupabaseClient): MediaStore {
  return {
    async upload(key, bytes, contentType) {
      const bucket = db.storage.from(QUESTION_MEDIA_BUCKET)
      const { error } = await bucket.upload(key, bytes, {
        contentType,
        upsert: false,
        // Keys are content hashes, so an object never changes — cache it forever.
        cacheControl: '31536000',
      })
      // Same key = same bytes; an "already exists" error is a successful no-op.
      if (error && !/exist|duplicate/i.test(error.message)) {
        throw new Error(`figure upload failed: ${error.message}`)
      }
      return bucket.getPublicUrl(key).data.publicUrl
    },
  }
}
