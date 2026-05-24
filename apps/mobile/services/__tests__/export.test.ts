import { exportUserData } from '../export'

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))

const mockCreateFileAsync = jest.fn().mockResolvedValue('content://picked/iskotify-export-2026-05-24.json')
const mockWriteAsStringAsync = jest.fn().mockResolvedValue(undefined)
const mockRequestDirPerms = jest.fn().mockResolvedValue({ granted: true, directoryUri: 'content://picked/' })

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockRequestDirPerms(...args),
    createFileAsync: (...args: unknown[]) => mockCreateFileAsync(...args),
    writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  },
}))

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}))

function makeDb(settingsRow: { selectedListingSlug: string; lastSyncedAt: number } | null) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(settingsRow ? [settingsRow] : []),
        })),
      })),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestDirPerms.mockResolvedValue({ granted: true, directoryUri: 'content://picked/' })
  mockCreateFileAsync.mockResolvedValue('content://picked/iskotify-export-2026-05-24.json')
  mockWriteAsStringAsync.mockResolvedValue(undefined)
  // Reset platform to android by default
  const RN = require('react-native')
  RN.Platform.OS = 'android'
})

describe('exportUserData (Android, SAF)', () => {
  it('opens the SAF directory picker', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockRequestDirPerms).toHaveBeenCalledTimes(1)
  })

  it('creates the JSON file in the picked directory', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockCreateFileAsync).toHaveBeenCalledWith(
      'content://picked/',
      expect.stringMatching(/^iskotify-export-\d{4}-\d{2}-\d{2}\.json$/),
      'application/json',
    )
  })

  it('writes the JSON payload to the created file', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'content://picked/iskotify-export-2026-05-24.json',
      expect.stringContaining('"exported_at"'),
    )
  })

  it('returns { status: "saved", filename } on success', async () => {
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.filename).toMatch(/^iskotify-export-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('returns { status: "cancelled" } when user denies the picker', async () => {
    mockRequestDirPerms.mockResolvedValue({ granted: false, directoryUri: '' })
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(result.status).toBe('cancelled')
    expect(mockCreateFileAsync).not.toHaveBeenCalled()
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled()
  })
})

describe('exportUserData (iOS, share sheet)', () => {
  beforeEach(() => {
    const RN = require('react-native')
    RN.Platform.OS = 'ios'
  })

  it('writes to documentDirectory and calls shareAsync', async () => {
    const FileSystem = require('expo-file-system/legacy')
    const Sharing = require('expo-sharing')
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/iskotify-export-\d{4}-\d{2}-\d{2}\.json$/),
      expect.stringContaining('"exported_at"'),
      { encoding: 'utf8' },
    )
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('saved')
  })

  it('throws when sharing is not available on iOS', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(
      exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    ).rejects.toThrow('Sharing not available')
  })
})
