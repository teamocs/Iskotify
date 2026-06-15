import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from './supabase'

// ── In-app bug reports & feedback (best-effort, fire-to-cloud) ────────────────
// Unlike question reports there is no local offline queue: these are low-volume,
// user-initiated submissions. Both helpers insert straight to Supabase and never
// throw to the UI — they return a boolean so the screen can show success/error.
// RLS allows anon + authenticated INSERT only (see migration 036); reads happen
// exclusively through the admin console's service-role client.

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'
const BUG_BUCKET = 'app-bug-reports'

/** Description snapshot cap — keeps rows small even for very long bug reports. */
const DESCRIPTION_MAX_CHARS = 4000

export interface BugReportInput {
  screen: string
  description: string
  /** Optional local file URI of a screenshot (from expo-document-picker). */
  imageUri?: string
}

export interface FeedbackInput {
  rating?: number
  message: string
}

/** Best-effort current user id (null when signed out or on any failure). */
async function currentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

// Minimal base64 → bytes decoder. Avoids relying on a global atob and is easy to
// exercise under jest (the test mock returns valid base64).
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = clean.length
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  const byteLength = Math.floor((len * 3) / 4) - padding
  const bytes = new Uint8Array(byteLength > 0 ? byteLength : 0)
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const e0 = B64_ALPHABET.indexOf(clean[i] ?? 'A')
    const e1 = B64_ALPHABET.indexOf(clean[i + 1] ?? 'A')
    const e2 = B64_ALPHABET.indexOf(clean[i + 2] ?? 'A')
    const e3 = B64_ALPHABET.indexOf(clean[i + 3] ?? 'A')
    const chunk = (e0 << 18) | (e1 << 12) | (e2 << 6) | e3
    if (p < byteLength) bytes[p++] = (chunk >> 16) & 0xff
    if (p < byteLength) bytes[p++] = (chunk >> 8) & 0xff
    if (p < byteLength) bytes[p++] = chunk & 0xff
  }
  return bytes
}

/** Guess a content type + extension from a file URI. Defaults to PNG. */
function imageMeta(uri: string): { contentType: string; ext: string } {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { contentType: 'image/jpeg', ext: 'jpg' }
  if (lower.endsWith('.webp')) return { contentType: 'image/webp', ext: 'webp' }
  if (lower.endsWith('.heic')) return { contentType: 'image/heic', ext: 'heic' }
  return { contentType: 'image/png', ext: 'png' }
}

/**
 * Best-effort screenshot upload. Returns a public URL on success or null on ANY
 * failure (read error, network, RLS) — an image must never block the text report.
 */
async function uploadBugImage(uri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const bytes = base64ToBytes(base64)
    const { contentType, ext } = imageMeta(uri)
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const { error } = await supabase.storage.from(BUG_BUCKET).upload(path, bytes, { contentType })
    if (error) return null
    const { data } = supabase.storage.from(BUG_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

/**
 * File an in-app bug report. Captures platform + app version automatically.
 * If an imageUri is supplied we attempt a best-effort upload first; an image
 * failure degrades gracefully to a text-only report. Never throws.
 */
export async function submitBugReport(input: BugReportInput): Promise<boolean> {
  try {
    const userId = await currentUserId()
    let imageUrl: string | null = null
    if (input.imageUri) {
      imageUrl = await uploadBugImage(input.imageUri)
    }
    const { error } = await supabase.from('app_bug_reports').insert({
      screen: input.screen.trim() || 'General',
      description: input.description.trim().slice(0, DESCRIPTION_MAX_CHARS),
      image_url: imageUrl,
      app_version: APP_VERSION,
      platform: Platform.OS,
      user_id: userId,
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Leave general app feedback with an optional 1–5 star rating. Never throws.
 */
export async function submitFeedback(input: FeedbackInput): Promise<boolean> {
  try {
    const userId = await currentUserId()
    const rating = typeof input.rating === 'number' ? input.rating : null
    const { error } = await supabase.from('app_feedback').insert({
      rating,
      message: input.message.trim().slice(0, DESCRIPTION_MAX_CHARS),
      user_id: userId,
    })
    return !error
  } catch {
    return false
  }
}
