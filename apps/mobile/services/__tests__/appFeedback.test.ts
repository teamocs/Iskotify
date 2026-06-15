/**
 * Unit tests for services/appFeedback.ts
 *
 * Both submitBugReport and submitFeedback are best-effort: they insert directly
 * to Supabase and must NEVER throw to the UI (return false on any failure).
 *
 * supabase is mocked exactly like questionReports.test (auth.getSession + from).
 * The image-upload path reads bytes via expo-file-system/legacy (mocked) and
 * pushes them through supabase.storage; an image failure must still let the
 * text-only report insert succeed.
 */

// Capture the version that the service reads from expo-constants.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9' } },
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}))

// Override the shared legacy mock so EncodingType.Base64 exists and
// readAsStringAsync is per-test configurable.
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: jest.fn().mockResolvedValue('AAAA'),
}))

import { submitBugReport, submitFeedback } from '../appFeedback'

let supabase: any

/** Mock a table insert builder; resolves to { error } like supabase-js. */
function mockTableInsert(result: { error: unknown } = { error: null }) {
  const insert = jest.fn().mockResolvedValue(result)
  supabase.from.mockReturnValue({ insert })
  return insert
}

/** Mock the storage bucket: upload(path, bytes, opts) + getPublicUrl(path). */
function mockStorageBucket(opts: {
  uploadError?: unknown
  publicUrl?: string
} = {}) {
  const upload = jest.fn().mockResolvedValue({
    data: opts.uploadError ? null : { path: 'p' },
    error: opts.uploadError ?? null,
  })
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: opts.publicUrl ?? 'https://cdn.test/app-bug-reports/shot.png' },
  })
  const bucket = { upload, getPublicUrl }
  supabase.storage.from.mockReturnValue(bucket)
  return { upload, getPublicUrl }
}

beforeEach(() => {
  jest.clearAllMocks()
  supabase = require('../supabase').supabase
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  const FileSystem = require('expo-file-system/legacy')
  FileSystem.readAsStringAsync.mockResolvedValue('AAAA') // valid base64 ("\x00\x00\x00")
})

describe('submitBugReport', () => {
  it('inserts into app_bug_reports with screen, description, platform and app version', async () => {
    const insert = mockTableInsert()

    const ok = await submitBugReport({ screen: 'Practice', description: 'Crash on submit' })

    expect(ok).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('app_bug_reports')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: 'Practice',
        description: 'Crash on submit',
        platform: expect.any(String),
        app_version: '9.9.9',
        user_id: null,
      }),
    )
  })

  it('sends a null image_url and does NOT touch storage when no imageUri is given', async () => {
    const insert = mockTableInsert()

    await submitBugReport({ screen: 'General', description: 'Typo somewhere' })

    expect(supabase.storage.from).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }))
  })

  it('uploads the image and stores the resulting public URL when imageUri is given', async () => {
    const insert = mockTableInsert()
    const { upload, getPublicUrl } = mockStorageBucket({ publicUrl: 'https://cdn.test/app-bug-reports/x.png' })

    await submitBugReport({
      screen: 'Home',
      description: 'Button overlaps',
      imageUri: 'file:///tmp/shot.png',
    })

    expect(supabase.storage.from).toHaveBeenCalledWith('app-bug-reports')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(getPublicUrl).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'https://cdn.test/app-bug-reports/x.png' }),
    )
  })

  it('still inserts the text report (image_url null) when the storage upload fails', async () => {
    const insert = mockTableInsert()
    mockStorageBucket({ uploadError: { message: 'bucket missing' } })

    const ok = await submitBugReport({
      screen: 'Home',
      description: 'Image attached but upload dies',
      imageUri: 'file:///tmp/shot.png',
    })

    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }))
  })

  it('still inserts the text report when reading the image file throws', async () => {
    const insert = mockTableInsert()
    mockStorageBucket()
    const FileSystem = require('expo-file-system/legacy')
    FileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('cannot read'))

    const ok = await submitBugReport({
      screen: 'Home',
      description: 'unreadable image',
      imageUri: 'file:///tmp/broken.png',
    })

    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }))
  })

  it('sends the signed-in user id when a session exists', async () => {
    const insert = mockTableInsert()
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-42' } } } })

    await submitBugReport({ screen: 'General', description: 'hi' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-42' }))
  })

  it('returns false (no throw) when the insert returns an error object', async () => {
    mockTableInsert({ error: { message: 'RLS denied' } })

    await expect(
      submitBugReport({ screen: 'General', description: 'x' }),
    ).resolves.toBe(false)
  })

  it('returns false (no throw) when the insert rejects', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('offline'))
    supabase.from.mockReturnValue({ insert })

    await expect(
      submitBugReport({ screen: 'General', description: 'x' }),
    ).resolves.toBe(false)
  })
})

describe('submitFeedback', () => {
  it('inserts rating + message into app_feedback', async () => {
    const insert = mockTableInsert()

    const ok = await submitFeedback({ rating: 5, message: 'Love it' })

    expect(ok).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('app_feedback')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 5, message: 'Love it', user_id: null }),
    )
  })

  it('inserts a null rating when none is given', async () => {
    const insert = mockTableInsert()

    await submitFeedback({ message: 'No stars but words' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ rating: null }))
  })

  it('sends the signed-in user id when a session exists', async () => {
    const insert = mockTableInsert()
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-7' } } } })

    await submitFeedback({ rating: 4, message: 'good' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-7' }))
  })

  it('returns false (no throw) when the insert returns an error', async () => {
    mockTableInsert({ error: { message: 'denied' } })
    await expect(submitFeedback({ message: 'x' })).resolves.toBe(false)
  })

  it('returns false (no throw) when the insert rejects', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('offline'))
    supabase.from.mockReturnValue({ insert })
    await expect(submitFeedback({ message: 'x' })).resolves.toBe(false)
  })
})
