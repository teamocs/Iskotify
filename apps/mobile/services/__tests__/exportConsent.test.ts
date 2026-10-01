/**
 * P1b: the consent record is part of the data export and comes back on import.
 * Real SQLite (CREATE_SQL + MIGRATIONS), Android storage mocked.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { exportUserData, importUserData } from '../export'

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }))

const mockWrite = jest.fn().mockResolvedValue(undefined)
const mockRead = jest.fn()
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: (...a: unknown[]) => mockRead(...a),
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, directoryUri: 'content://d/' }),
    createFileAsync: jest.fn().mockResolvedValue('content://d/x.json'),
    writeAsStringAsync: (...a: unknown[]) => mockWrite(...a),
  },
}))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.json' }] }),
}))
jest.mock('../queryCache', () => ({ invalidate: jest.fn() }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
const row = (raw: InstanceType<typeof Database>) => raw.prepare('SELECT * FROM user_settings WHERE id=1').get() as Record<string, unknown>

describe('export / import carry the consent record', () => {
  it('the export file includes the consent columns', async () => {
    const { raw, db } = makeDb()
    raw.prepare(`INSERT INTO user_settings (id, full_name, age_band, consent_version, consented_at, guardian_consent_at, sensitive_consent_at, analytics_opt_in, sensitive_withdrawn_at, analytics_choice_at)
      VALUES (1, 'Juan', 'minor', '2026-10-01', 5, 6, 7, 0, 3, 4)`).run()
    await exportUserData(db)
    const payload = JSON.parse(mockWrite.mock.calls[0]![1] as string)
    expect(payload.settings).toMatchObject({
      ageBand: 'minor', consentVersion: '2026-10-01', consentedAt: 5, guardianConsentAt: 6,
      sensitiveConsentAt: 7, analyticsOptIn: 0, sensitiveWithdrawnAt: 3, analyticsChoiceAt: 4,
    })
  })

  it('import restores them from an app export (camelCase)', async () => {
    const { raw, db } = makeDb()
    mockRead.mockResolvedValue(JSON.stringify({
      exported_at: '2026-10-01T00:00:00Z',
      settings: {
        fullName: 'Juan', ageBand: 'minor', consentVersion: '2026-10-01', consentedAt: 5, guardianConsentAt: 6,
        sensitiveConsentAt: 7, analyticsOptIn: 1, sensitiveWithdrawnAt: 3, analyticsChoiceAt: 4,
      },
    }))
    await importUserData(db)
    expect(row(raw)).toMatchObject({
      age_band: 'minor', consent_version: '2026-10-01', consented_at: 5, guardian_consent_at: 6,
      sensitive_consent_at: 7, analytics_opt_in: 1, sensitive_withdrawn_at: 3, analytics_choice_at: 4,
    })
  })

  it('import restores them from snake_case rows and keeps an unset analytics choice unset', async () => {
    const { raw, db } = makeDb()
    mockRead.mockResolvedValue(JSON.stringify({
      exported_at: '2026-10-01T00:00:00Z',
      settings: {
        full_name: 'Juan', age_band: 'adult', consent_version: '2026-10-01', consented_at: 5, guardian_consent_at: 0,
        sensitive_consent_at: 0, analytics_opt_in: null, sensitive_withdrawn_at: 8, analytics_choice_at: 0,
      },
    }))
    await importUserData(db)
    expect(row(raw)).toMatchObject({ age_band: 'adult', consent_version: '2026-10-01', consented_at: 5, analytics_opt_in: null, sensitive_withdrawn_at: 8 })
  })

  it('an old export with no consent keys leaves the consent on this device alone', async () => {
    const { raw, db } = makeDb()
    raw.prepare(`INSERT INTO user_settings (id, age_band, consent_version, consented_at, sensitive_consent_at)
      VALUES (1, 'adult', '2026-10-01', 9, 8)`).run()
    mockRead.mockResolvedValue(JSON.stringify({ exported_at: '2025-01-01T00:00:00Z', settings: { fullName: 'Juan' } }))
    await importUserData(db)
    expect(row(raw)).toMatchObject({ age_band: 'adult', consent_version: '2026-10-01', consented_at: 9, sensitive_consent_at: 8 })
  })
})
