import { describe, it, expect } from 'vitest'
import { BUG_SCREENSHOT_BUCKET, SIGNED_URL_TTL_SEC, bugScreenshotPath } from '../bugScreenshot'

describe('bugScreenshotPath', () => {
  it('uses the private app-bug-reports bucket and a short signed-URL lifetime', () => {
    expect(BUG_SCREENSHOT_BUCKET).toBe('app-bug-reports')
    expect(SIGNED_URL_TTL_SEC).toBeGreaterThanOrEqual(5 * 60)
    expect(SIGNED_URL_TTL_SEC).toBeLessThanOrEqual(10 * 60)
  })

  it('returns a bare object path unchanged (new rows)', () => {
    expect(bugScreenshotPath('1727000000000-ab12cd34.png')).toBe('1727000000000-ab12cd34.png')
  })

  it('extracts the path from an old public URL', () => {
    expect(bugScreenshotPath(
      'https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/1727000000000-ab12cd34.png',
    )).toBe('1727000000000-ab12cd34.png')
  })

  it('extracts the path from an old URL with a query string or a nested folder', () => {
    expect(bugScreenshotPath(
      'https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/2026/09/shot.jpg?download=1',
    )).toBe('2026/09/shot.jpg')
  })

  it('decodes percent-encoded characters in an old URL', () => {
    expect(bugScreenshotPath(
      'https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/my%20shot.png',
    )).toBe('my shot.png')
  })

  it('returns null for empty values', () => {
    expect(bugScreenshotPath(null)).toBeNull()
    expect(bugScreenshotPath(undefined)).toBeNull()
    expect(bugScreenshotPath('')).toBeNull()
    expect(bugScreenshotPath('   ')).toBeNull()
  })

  it('refuses URLs that point at another bucket or are not storage URLs', () => {
    expect(bugScreenshotPath('https://abcd.supabase.co/storage/v1/object/public/question-media/x.png')).toBeNull()
    expect(bugScreenshotPath('https://evil.example.com/x.png')).toBeNull()
  })

  it('refuses paths with empty segments (// or a trailing slash)', () => {
    expect(bugScreenshotPath('a//b.png')).toBeNull()
    expect(bugScreenshotPath('folder/')).toBeNull()
    expect(bugScreenshotPath('https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/a//b.png')).toBeNull()
    expect(bugScreenshotPath('https://abcd.supabase.co/storage/v1/object/public/app-bug-reports//b.png')).toBeNull()
  })

  it('refuses paths that try to climb out of the bucket', () => {
    expect(bugScreenshotPath('../secret.png')).toBeNull()
    expect(bugScreenshotPath('a/../../b.png')).toBeNull()
    expect(bugScreenshotPath('https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/%2E%2E/x.png')).toBeNull()
  })
})
