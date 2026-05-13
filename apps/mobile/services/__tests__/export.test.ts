import { exportUserData } from '../export'

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
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
  const Sharing = require('expo-sharing')
  Sharing.isAvailableAsync.mockResolvedValue(true)
  Sharing.shareAsync.mockResolvedValue(undefined)
  const FileSystem = require('expo-file-system')
  FileSystem.writeAsStringAsync.mockResolvedValue(undefined)
})

describe('exportUserData', () => {
  it('writes a JSON file containing selected_listing_slug', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 1700000000000 }) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('upcat')
  })

  it('includes exported_at timestamp in output', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).exported_at).toBeDefined()
  })

  it('calls shareAsync after writing the file', async () => {
    const Sharing = require('expo-sharing')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/iskotify-export.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    )
  })

  it('throws when sharing is not available', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(
      exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    ).rejects.toThrow('Sharing not available')
  })

  it('uses empty slug when no settings row exists', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(null) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('')
  })
})
