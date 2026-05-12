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

const mockSettings = {
  selectedListingSlug: 'upcat',
  lastSyncedAt: 1700000000000,
}

function makeDb(settings: typeof mockSettings | null) {
  return {
    get: jest.fn(() => ({
      find: settings
        ? jest.fn().mockResolvedValue(settings)
        : jest.fn().mockRejectedValue(new Error('not found')),
    })),
  }
}

beforeEach(() => jest.clearAllMocks())

describe('exportUserData', () => {
  it('writes a JSON file containing selected_listing_slug', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(mockSettings) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('upcat')
  })

  it('includes exported_at timestamp in output', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(mockSettings) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).exported_at).toBeDefined()
  })

  it('calls shareAsync after writing the file', async () => {
    const Sharing = require('expo-sharing')
    await exportUserData(makeDb(mockSettings) as any)
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/iskotify-export.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    )
  })

  it('throws when sharing is not available', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(exportUserData(makeDb(mockSettings) as any)).rejects.toThrow('Sharing not available')
  })
})
