# PR 15 — Gemma 3 1b Model Swap + Kuya Baw Chat Memory

## Goal

Replace the local LLM (Qwen 2.5 1.5B) with Gemma 3 1b and persist Kuya Baw chat history to SQLite so conversation survives modal closes and is fed back to the model as multi-turn context.

## Tech Stack

Expo 53 · React Native · llama.rn · Drizzle ORM · Expo SQLite · TypeScript

---

## Part 1: Model Swap

### New Model

| Property | Old | New |
|----------|-----|-----|
| File | `qwen2.5-1.5b-instruct-q4_k_m.gguf` | `gemma-3-1b-it-Q4_K_M.gguf` |
| HuggingFace repo | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` | `bartowski/gemma-3-1b-it-GGUF` |
| Prompt format | ChatML (`<\|im_start\|>`) | Gemma turns (`<start_of_turn>`) |
| Stop tokens | `['<\|im_end\|>', '</s>']` | `['<end_of_turn>', '<eos>']` |

### Prompt Format

Gemma 3 has no dedicated system role. The system prompt is embedded in the first user turn. Single-turn (no history):

```
<start_of_turn>user
{SYSTEM_PROMPT}

{INSTRUCTION + DATA_CONTEXT + QUESTION}<end_of_turn>
<start_of_turn>model
```

Multi-turn (with history — see Part 2):

```
<start_of_turn>user
{history_user_1}<end_of_turn>
<start_of_turn>model
{history_assistant_1}<end_of_turn>
...
<start_of_turn>user
{SYSTEM_PROMPT}

{INSTRUCTION + DATA_CONTEXT + CURRENT_QUESTION}<end_of_turn>
<start_of_turn>model
```

The system prompt + student context are injected **only into the current (final) user turn**, not into history turns. This avoids stale context from old data.

### Files to Change

| File | Change |
|------|--------|
| `apps/mobile/services/llm.ts` | `MODEL_FILENAME`, `MODEL_DOWNLOAD_URL`, stop tokens in all 3 inference functions |
| `apps/mobile/services/chatPrompts.ts` | Prompt template format + sanitizer (strip Gemma tokens) |
| `apps/mobile/services/coachPrompts.ts` | `buildCoachPrompt` format + `parseCoachPhrase` token filter |

### Prompt Injection Sanitizer

The user-input sanitizer in `chatPrompts.ts` currently strips ChatML tokens. Update to strip Gemma turn tokens instead:

```ts
const safeQuestion = question
  .replace(/<(start|end)_of_turn>\s*(?:user|model)\b[\s\S]*$/gi, '')
  .replace(/<(start|end)_of_turn>/g, '')
```

`parseCoachPhrase` currently rejects text containing `<|`. Add check for Gemma token leakage:

```ts
if (s.includes('<start_of_turn>') || s.includes('<end_of_turn>')) return null
```

---

## Part 2: Chat Memory Persistence

### Database

New table `chat_messages` added via the `MIGRATIONS` array in `client.ts`:

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```

Drizzle schema entry (`schema.ts`):

```ts
export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  text: text('text').notNull(),
  mode: text('mode').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [
  index('chat_messages_created_at_idx').on(t.createdAt),
])
```

Two migration entries appended to `MIGRATIONS` in `client.ts`:

```ts
`CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at)`,
```

### `useKuyaChat` Changes

**Load on mount:** Query all `chat_messages` ordered by `created_at` ASC and hydrate initial `messages` state. Each DB row maps to a `ChatMessage` with `id: String(row.id)`.

**Save on completion:** After the assistant message finishes streaming (not on abort, not on error), insert both the user message and final assistant text into `chat_messages` in a single Drizzle transaction.

**`clearHistory` action:** Deletes all rows from `chat_messages` and calls `setMessages([])`. Exposed from the hook return value.

**Pass history to prompt:** The `send` callback passes `messages.slice(-10)` (last 10 from current state, before appending the new pair) to `buildChatPrompt`.

Updated hook return type:

```ts
interface UseKuyaChat {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  messages: ChatMessage[]
  send: (text: string) => void
  abort: () => void
  clearHistory: () => Promise<void>
  isStreaming: boolean
  isModelReady: boolean
}
```

### `buildChatPrompt` Changes

New signature:

```ts
export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
  history?: Array<{ role: 'user' | 'assistant'; text: string }>,
): string
```

History turns use bare Gemma turn markers (no system prompt injection). The system prompt + `[INSTRUCTION]` + `[STUDENT CONTEXT]` + `[QUESTION]` are placed only in the final user turn.

### `AskKuyaModal` Changes

A small **"Clear"** `TouchableOpacity` is added to the header row, right of the title and left of the close button. Shown only when `messages.length > 0` and not streaming. Pressing it calls `clearHistory()`. Styled as a small secondary text button (no background, `t.textSecondary` color).

### Files to Change

| File | Change |
|------|--------|
| `apps/mobile/db/schema.ts` | Add `chatMessages` table |
| `apps/mobile/db/client.ts` | Add `CREATE TABLE` migration entry |
| `apps/mobile/services/chatPrompts.ts` | Add `history` param to `buildChatPrompt` |
| `apps/mobile/hooks/useKuyaChat.ts` | Load, save, clear, pass history |
| `apps/mobile/components/AskKuyaModal.tsx` | Clear button in header |

---

## File Map (combined)

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/mobile/services/llm.ts` | Modify | Model config + stop tokens |
| `apps/mobile/services/chatPrompts.ts` | Modify | Gemma format + history param + sanitizer |
| `apps/mobile/services/coachPrompts.ts` | Modify | Gemma format + token filter |
| `apps/mobile/db/schema.ts` | Modify | Add `chatMessages` table |
| `apps/mobile/db/client.ts` | Modify | Add migration |
| `apps/mobile/hooks/useKuyaChat.ts` | Modify | Load/save/clear history, pass to prompt |
| `apps/mobile/components/AskKuyaModal.tsx` | Modify | Clear button |

---

## Context Window Budget (Gemma 3 1b, n_ctx=2048)

| Component | ~Tokens |
|-----------|---------|
| System prompt | 80 |
| Student context | 200 |
| [INSTRUCTION] + [QUESTION] | 60 |
| 10 history messages | 400 |
| n_predict (response) | 60 |
| **Total** | **~800** |

Comfortable within 2048 — no context window changes needed.
