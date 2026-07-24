import { renderHook, waitFor } from '@testing-library/react-native'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { _clearForTests } from '../../services/queryCache'

function makeDb(row?: { chatEnabled: 0 | 1 }): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE ai_chat_config (
      id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
      core_rules_override TEXT NOT NULL DEFAULT '',
      scope_block_override TEXT NOT NULL DEFAULT '',
      grounding_rule_override TEXT NOT NULL DEFAULT '',
      anti_injection_override TEXT NOT NULL DEFAULT '',
      progress_addendum_override TEXT NOT NULL DEFAULT '',
      topic_addendum_override TEXT NOT NULL DEFAULT '',
      math_addendum_override TEXT NOT NULL DEFAULT '',
      rag_total_token_budget INTEGER NOT NULL DEFAULT 700,
      rag_per_block_char_cap INTEGER NOT NULL DEFAULT 280,
      rag_blocks_enabled TEXT NOT NULL DEFAULT '{}',
      chat_enabled INTEGER NOT NULL DEFAULT 0,
      remote_updated_at INTEGER
    );
  `)
  if (row) {
    raw.prepare('INSERT INTO ai_chat_config (id, chat_enabled) VALUES (1, ?)').run(row.chatEnabled)
  }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const mockDb = jest.fn<DrizzleClient, []>()

jest.mock('../useDb', () => ({
  useDb: () => mockDb(),
}))

import { useKuyaEnabled } from '../useKuyaEnabled'

describe('useKuyaEnabled', () => {
  beforeEach(() => {
    _clearForTests()
  })

  it('defaults to enabled=false, loading=true on first synchronous render', () => {
    mockDb.mockReturnValue(makeDb())
    const { result } = renderHook(() => useKuyaEnabled())
    expect(result.current.enabled).toBe(false)
    expect(result.current.loading).toBe(true)
  })

  it('stays disabled when there is no ai_chat_config row (fresh install)', async () => {
    mockDb.mockReturnValue(makeDb())
    const { result } = renderHook(() => useKuyaEnabled())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
  })

  it('stays disabled when chat_enabled = 0', async () => {
    mockDb.mockReturnValue(makeDb({ chatEnabled: 0 }))
    const { result } = renderHook(() => useKuyaEnabled())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
  })

  it('reports enabled=true when chat_enabled = 1', async () => {
    mockDb.mockReturnValue(makeDb({ chatEnabled: 1 }))
    const { result } = renderHook(() => useKuyaEnabled())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)
  })
})
