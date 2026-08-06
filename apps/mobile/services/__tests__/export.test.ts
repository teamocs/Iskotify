import { exportUserData, importUserData } from '../export'

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
  readAsStringAsync: jest.fn(),
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
  ...jest.requireActual('drizzle-orm'),
  eq: jest.fn((col, val) => ({ col, val })),
}))

jest.mock('../queryCache', () => ({
  invalidate: jest.fn(),
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

function makeDbFull() {
  const makeFrom = () => {
    const p = Promise.resolve([]) as any
    p.where = () => p
    p.limit = () => Promise.resolve([])
    p.orderBy = () => Promise.resolve([])
    return p
  }
  return {
    select: jest.fn(() => ({ from: jest.fn(() => makeFrom()) })),
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

// ── importUserData (Finding #3) ──────────────────────────────────────────────

function tableName(table: unknown): string {
  const { getTableName } = require('drizzle-orm')
  return getTableName(table as any)
}

function makeImportDb() {
  const deletedTables: string[] = []
  const insertedRows: { table: string; row: Record<string, unknown> }[] = []

  const db = {
    delete: jest.fn().mockImplementation((table: unknown) => {
      deletedTables.push(tableName(table))
      return Promise.resolve(undefined)
    }),
    insert: jest.fn().mockImplementation((table: unknown) => {
      const name = tableName(table)
      return {
        values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
          insertedRows.push({ table: name, row })
          const chain: any = Promise.resolve(undefined)
          chain.onConflictDoNothing = jest.fn().mockResolvedValue(undefined)
          chain.onConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
          return chain
        }),
      }
    }),
  }

  return { db, deletedTables, insertedRows }
}

const BASE_PAYLOAD = {
  exported_at: '2026-05-24T00:00:00.000Z',
  settings: { selectedListingSlug: 'upcat', lastSyncedAt: 0 },
}

function mockImportFile(payload: Record<string, unknown>) {
  const DocumentPicker = require('expo-document-picker')
  const FileSystem = require('expo-file-system/legacy')
  DocumentPicker.getDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///picked/export.json' }],
  })
  FileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(payload))
}

describe('importUserData guards deletes on the field being present (Finding #3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const RN = require('react-native')
    RN.Platform.OS = 'android'
  })

  it('does NOT delete question_attempts/flashcard_srs/study_plan_items when the import file lacks those keys (old backup)', async () => {
    mockImportFile(BASE_PAYLOAD) // no question_attempts / flashcard_srs / study_plan_items keys at all
    const { db, deletedTables, insertedRows } = makeImportDb()

    await importUserData(db as any)

    expect(deletedTables).not.toContain('question_attempts')
    expect(deletedTables).not.toContain('flashcard_srs')
    expect(deletedTables).not.toContain('study_plan_items')
    expect(insertedRows.some(r => r.table === 'question_attempts')).toBe(false)
    expect(insertedRows.some(r => r.table === 'flashcard_srs')).toBe(false)
    expect(insertedRows.some(r => r.table === 'study_plan_items')).toBe(false)
  })

  it('DOES delete+replace question_attempts/flashcard_srs/study_plan_items when the import file has rows for them', async () => {
    mockImportFile({
      ...BASE_PAYLOAD,
      question_attempts: [{
        sessionKey: 1, sourceTable: 'flashcards', questionId: 'q1', listingSlug: 'upcat',
        selectedIndex: 1, correctIndex: 1, correct: true, elapsedMs: 500, answeredAt: 1000,
      }],
      flashcard_srs: [{
        flashcardId: 'f1', intervalDays: 3, easeFactor: 2.5, repetitions: 1, lapses: 0, dueAt: 2000,
      }],
      study_plan_items: [{
        planDate: '2026-05-24', kind: 'flashcard', refId: 'f1', targetCount: 1, createdAt: 1000,
      }],
    })
    const { db, deletedTables, insertedRows } = makeImportDb()

    await importUserData(db as any)

    expect(deletedTables).toContain('question_attempts')
    expect(deletedTables).toContain('flashcard_srs')
    expect(deletedTables).toContain('study_plan_items')

    const attemptRow = insertedRows.find(r => r.table === 'question_attempts')
    expect(attemptRow?.row).toMatchObject({ questionId: 'q1', correct: true })

    const srsRow = insertedRows.find(r => r.table === 'flashcard_srs')
    expect(srsRow?.row).toMatchObject({ flashcardId: 'f1', intervalDays: 3 })

    const planRow = insertedRows.find(r => r.table === 'study_plan_items')
    expect(planRow?.row).toMatchObject({ planDate: '2026-05-24', kind: 'flashcard' })
  })

  it('an empty array for the field still counts as "present" but inserts nothing (and per sync.ts parity, does not wipe either)', async () => {
    mockImportFile({ ...BASE_PAYLOAD, question_attempts: [], flashcard_srs: [], study_plan_items: [] })
    const { db, deletedTables, insertedRows } = makeImportDb()

    await importUserData(db as any)

    // Empty arrays carry no rows to restore — matching sync.ts's "only wipe
    // when there's something to replace it with" behavior, an empty list is
    // treated the same as an absent key: nothing is deleted or inserted.
    expect(deletedTables).not.toContain('question_attempts')
    expect(deletedTables).not.toContain('flashcard_srs')
    expect(deletedTables).not.toContain('study_plan_items')
    expect(insertedRows.some(r => r.table === 'question_attempts')).toBe(false)
    expect(insertedRows.some(r => r.table === 'flashcard_srs')).toBe(false)
    expect(insertedRows.some(r => r.table === 'study_plan_items')).toBe(false)
  })
})

describe('exportUserData includes notes fields', () => {
  it('writes JSON payload containing notes, note_labels, note_label_assignments keys', async () => {
    await exportUserData(makeDbFull() as any)
    const written: string = mockWriteAsStringAsync.mock.calls[0]![1] as string
    const parsed = JSON.parse(written) as Record<string, unknown>
    expect(parsed).toHaveProperty('notes')
    expect(parsed).toHaveProperty('note_labels')
    expect(parsed).toHaveProperty('note_label_assignments')
    expect(Array.isArray(parsed.notes)).toBe(true)
    expect(Array.isArray(parsed.note_labels)).toBe(true)
    expect(Array.isArray(parsed.note_label_assignments)).toBe(true)
  })
})
