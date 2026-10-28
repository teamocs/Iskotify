import type { ContentStatus, ContentType } from '@/lib/driveContent/syncContent'

// One row of the drive_content_files ledger (migration 068) as /admin/sync reads it.
export interface ContentFileRow {
  content_type: ContentType
  drive_file_id: string
  name: string
  path: string
  status: ContentStatus
  message: string | null
  synced_at: string
}

export const CONTENT_FILE_COLUMNS = 'content_type, drive_file_id, name, path, status, message, synced_at'

/** blog_posts columns /admin/sync lists (kept here, not in the 'use client' DriveBlogCard, for the server page). */
export const BLOG_POST_COLUMNS = 'id, slug, title, status, first_published_at, updated_at'

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A JSON request init for apiRequest. */
export const jsonInit = (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
