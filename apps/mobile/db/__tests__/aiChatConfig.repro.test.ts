import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { aiChatConfig } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Reproduces a device that already had `ai_chat_config` BEFORE `chat_enabled`
// was added. CREATE_SQL uses `CREATE TABLE IF NOT EXISTS ai_chat_config (...)`,
// which is a no-op once the table exists — so on such a device the only way
// `chat_enabled` gets added is the ALTER TABLE migration below. This test
// simulates that legacy state (create the table via the pre-chat_enabled
// shape, exactly like CREATE_SQL used to look) and then runs the *current*
// MIGRATIONS list against it, asserting the column exists and behaves.
function makeLegacyRaw() {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_config (
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
      remote_updated_at INTEGER
    )
  `)
  // Run the *current* CREATE_SQL too (CREATE TABLE IF NOT EXISTS is a no-op
  // against the legacy table above, matching real device behavior) followed
  // by the real MIGRATIONS sequence — same shape as the device boot path.
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { raw.exec(sql) } catch { /* duplicate column on re-run — matches device try/catch */ }
  }
  return raw
}

describe('ai_chat_config.chat_enabled — legacy table + real MIGRATIONS (drift guard)', () => {
  it('adds chat_enabled via ALTER TABLE even when the table pre-dates the column', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(ai_chat_config)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('chat_enabled')
  })

  it('defaults chat_enabled to 0 (disabled) for a pre-existing row with no explicit value', () => {
    const raw = makeLegacyRaw()
    // Simulate a row that existed before chat_enabled was added.
    raw.prepare(`
      INSERT INTO ai_chat_config (id, rag_blocks_enabled) VALUES (1, '{}')
    `).run()
    const row = raw.prepare(`SELECT chat_enabled FROM ai_chat_config WHERE id = 1`).get() as { chat_enabled: number }
    expect(row.chat_enabled).toBe(0)
  })

  it('reads/writes chat_enabled through drizzle after the migration sequence', async () => {
    const raw = makeLegacyRaw()
    const db = drizzle(raw, { schema })
    await db.insert(aiChatConfig).values({ id: 1, chatEnabled: true, ragBlocksEnabled: '{}' })
      .onConflictDoUpdate({ target: aiChatConfig.id, set: { chatEnabled: true } })
    const rows = await db.select().from(aiChatConfig).where(eq(aiChatConfig.id, 1)).limit(1)
    expect(rows[0]?.chatEnabled).toBe(true)
  })
})
