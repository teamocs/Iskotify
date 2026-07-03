import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { useHomeStats } from './useHomeStats'
import { streamChatInference, modelExists } from '../services/llm'
import { scheduleWebPersist } from '../db/webPersist'
import {
  buildChatPrompt, parseChatChunk, isMathQuestion, detectChatMode,
  composeSystemPrompt,
} from '../services/chatPrompts'
import { buildRagContext } from '../services/ragPipeline'
import { getAiConfig } from '../services/aiConfig'
import type { AiChatConfig } from '../services/aiConfig'
import { chatMessages } from '../db/schema'
import { getSettings } from '../services/settings'
import { getGeminiKey } from '../services/geminiKey'
import { generateGeminiReply } from '../services/geminiClient'
import { classifyDataIntent, answerFromData, ssotNotFoundMessage, looksFactual, stripTag } from '../services/ssotAnswer'
import { buildListingsEnumeration, buildSubjectsContext } from '../services/chatContext'
import { buildRetrievalQuery } from '../utils/retrievalQuery'
import { verifyGrounding } from '../services/groundingCheck'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  isStreaming?: boolean
  error?: string
}

interface UseKuyaChat {
  messages: ChatMessage[]
  send: (text: string) => void
  abort: () => void
  clearHistory: () => Promise<void>
  isStreaming: boolean
  isModelReady: boolean
}

const FLUSH_INTERVAL_MS = 60
const MIN_QUESTION_LENGTH = 5

const TAGALOG_INDICATORS = /\b(kong|mong|akin|sayo|ikaw|siya|niya|mga|nang|kasi|dahil|naman|meron|pag-aaral|kumpanya|gobyerno|naging|magiging|gawin|mahalaga|nais|paano|hindi|wala|kaya|tara|opo|anong|saan|kelan|tayo|kayo|sila|natin|talaga)\b/gi

function isTagalogHeavy(text: string): boolean {
  const matches = text.match(TAGALOG_INDICATORS)
  return (matches?.length ?? 0) >= 3
}

// ── Grounding enforcement (Phase 3, T3.2) ──────────────────────────────────────
// Warm, safe replacement shown when a factual answer contains a date/amount/URL
// the retrieved context does NOT support (a fabricated figure the 1B/Gemini
// invented). We persist THIS, never the fabricated text.
const GROUNDING_FALLBACK =
  "I don't want to risk giving you a wrong date or figure — please double-check that detail on the official page via the Lists tab. 📚"

/**
 * Deterministic grounding gate applied to a finalized LLM answer. Only runs for
 * FACTUAL questions with a non-empty retrieved context (never math, non-factual
 * reasoning, or empty-context sends). If any URL/year/amount in `displayText`
 * is absent from `blocks`, replace the whole answer with GROUNDING_FALLBACK.
 */
function applyGroundingGate(displayText: string, retrievalQuery: string, blocks: string): string {
  if (
    looksFactual(retrievalQuery) &&
    blocks.trim().length > 0 &&
    !verifyGrounding(displayText, blocks).grounded
  ) {
    return GROUNDING_FALLBACK
  }
  return displayText
}

// ── Gemini prompt helper ───────────────────────────────────────────────────────
// buildChatPrompt returns a full Gemma-format string (with turn tokens). For
// Gemini's REST API we need a system_instruction + user content separately.
// SYSTEM_PROMPT_PROGRESS / _TOPIC / _MATH are imported from chatPrompts.ts so
// both paths always share the exact same canonical prompt text.

/**
 * Build the user-content portion for Gemini (system prompt passed separately).
 * Consumes the assembled `ragBlocks` string from buildRagContext instead of
 * the four individual ctx params that existed pre-Task-C.
 * History is prepended as plain text (no Gemma turn tokens).
 */
function buildGeminiUserContent(
  question: string,
  ragBlocks: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
): string {
  const sanitize = (s: string) =>
    s.replace(/<(start|end)_of_turn>\s*(?:user|model)\b[\s\S]*$/gi, '').replace(/<(start|end)_of_turn>/g, '')

  const safeQuestion = sanitize(question)
  const sections: string[] = ['[INSTRUCTION] Respond in clear English only.']

  if (ragBlocks && ragBlocks.length > 0) {
    sections.push(sanitize(ragBlocks))
  }

  // Prepend recent history as plain text
  let historyBlock = ''
  if (history.length > 0) {
    historyBlock = history.map(m =>
      `${m.role === 'user' ? 'Student' : 'Kuya Baw'}: ${sanitize(m.text)}`
    ).join('\n') + '\n\n'
  }

  sections.push(`[QUESTION]\n${safeQuestion}`)
  return historyBlock + sections.join('\n\n')
}

export function useKuyaChat(): UseKuyaChat {
  const db = useDb()
  const stats = useHomeStats()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isModelReady, setIsModelReady] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const bufferRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assistantIdRef = useRef<string | null>(null)
  // Tracks text flushed to state via scheduleFlush so finalization can compute the full text
  const accumulatedRef = useRef('')
  // Stable ref to db so mount effect doesn't re-run when mock returns a new object each render
  const dbRef = useRef(db)
  dbRef.current = db
  // Stable ref to messages so send doesn't recreate on every token flush
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // Stable ref to stats — kept current via useEffect so send() always reads the
  // latest stats without triggering re-creation of the send callback.
  const statsRef = useRef(stats)
  statsRef.current = stats

  // Check model availability + load chat history on mount.
  // isModelReady = true when local model exists OR gemini is configured.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    isMountedRef.current = true

    void Promise.all([
      modelExists(),
      getSettings(dbRef.current),
      getGeminiKey(),
    ]).then(([exists, settings, geminiKey]) => {
      if (isMountedRef.current) {
        const geminiReady = settings.aiProvider === 'gemini' && geminiKey !== null
        setIsModelReady(exists || geminiReady)
      }
    })

    void dbRef.current.select().from(chatMessages).orderBy(chatMessages.createdAt).then(rows => {
      if (!isMountedRef.current) return
      setMessages(rows.map(r => ({
        id: String(r.id),
        role: r.role as 'user' | 'assistant',
        text: r.text,
        timestamp: r.createdAt,
        isStreaming: false,
      })))
    })
    return () => {
      isMountedRef.current = false
      abortRef.current?.abort()
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  // Keep statsRef current whenever stats object changes (including after refresh()).
  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  // AppState-aware abort
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        abortRef.current?.abort()
      }
    })
    return () => sub.remove()
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      const chunk = bufferRef.current
      bufferRef.current = ''
      const id = assistantIdRef.current
      if (!chunk || !id || !isMountedRef.current) return
      accumulatedRef.current += chunk
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, text: m.text + chunk } : m
      ))
    }, FLUSH_INTERVAL_MS)
  }, [])

  const send = useCallback((text: string) => {
    if (isStreaming) return
    const trimmed = text.trim()
    if (!trimmed) return

    const now = Date.now()
    accumulatedRef.current = ''

    const userMsg: ChatMessage = {
      id: `u-${now}`,
      role: 'user',
      text: trimmed,
      timestamp: now,
    }

    if (trimmed.length < MIN_QUESTION_LENGTH) {
      const canned = 'Please ask a more specific question — try one of the suggestions below.'
      setMessages(prev => [...prev, userMsg, {
        id: `a-${now}`,
        role: 'assistant' as const,
        text: canned,
        timestamp: now,
        isStreaming: false,
      }])
      return
    }

    const assistantId = `a-${now}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      timestamp: now,
      isStreaming: true,
    }
    assistantIdRef.current = assistantId
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    // Snapshot history before this exchange for the LLM prompt (max 10 messages)
    const historyForPrompt = messagesRef.current.slice(-10).map(m => ({ role: m.role, text: m.text }))

    // History-aware retrieval query: anaphoric / very short follow-ups
    // ("what about abroad?", "and the deadline?") don't carry enough to classify
    // or retrieve on their own, so prepend the most recent PRIOR user question.
    // The user-visible message, persistence, and the [QUESTION] shown to the model
    // all stay `trimmed`; only classification + RAG retrieval use retrievalQuery.
    const prevUserText = [...messagesRef.current].reverse().find(m => m.role === 'user')?.text ?? null
    const retrievalQuery = buildRetrievalQuery(trimmed, prevUserText)

    // Auto-detect mode from the question itself — no UI picker required.
    const mode = detectChatMode(trimmed)
    const isMath = isMathQuestion(trimmed)
    // effectiveMode for the RAG pipeline: math gets its own retrieval priority
    const effectiveMode = isMath ? 'math' : mode

    // SSoT data-intent classification (rule-based, no AI). Non-null → answer
    // deterministically from local DB without the LLM; null → reasoning → LLM.
    // Classify on the history-aware query so follow-ups route correctly.
    const dataIntent = classifyDataIntent(retrievalQuery)

    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        // Track whether we're in Gemini mode for the catch block's error mapping.
        // Must be declared outside try so the catch block can read it safely.
        let isGeminiMode = false
        try {
          // ── SSoT short-circuit (do-not-consume-AI path) ───────────────────
          // Data-lookup questions (profile/progress, top schools, career
          // destinations, courses, listings) are answered DETERMINISTICALLY
          // from the already-synced local DB — no LLM call. Only reasoning
          // questions (dataIntent === null) fall through to the RAG+LLM path.
          if (dataIntent) {
            // profile needs stats — mirror the existing progress stats-race guard.
            if (dataIntent === 'profile' && statsRef.current.listing === null) {
              await statsRef.current.refresh()
            }
            const answer =
              (await answerFromData(dbRef.current, trimmed, dataIntent, statsRef.current))
              ?? ssotNotFoundMessage(dataIntent)
            if (controller.signal.aborted || assistantIdRef.current !== assistantId || !isMountedRef.current) return
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, text: answer, isStreaming: false } : m
            ))
            setIsStreaming(false)
            // Persist like the other paths (mode 'progress' for profile, else 'topic').
            const ssotMode = dataIntent === 'profile' ? 'progress' : 'topic'
            void dbRef.current.transaction(async tx => {
              await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode: ssotMode, createdAt: now })
              await tx.insert(chatMessages).values({ role: 'assistant', text: answer, mode: ssotMode, createdAt: now + 1 })
            }).then(() => scheduleWebPersist()).catch(() => {})
            return
          }

          // ── Stats race fix: if progress mode but stats.listing is not loaded yet,
          // await refresh() once so the context block has real data.
          if (effectiveMode === 'progress' && statsRef.current.listing === null) {
            await statsRef.current.refresh()
            // statsRef.current is now updated via the useEffect([stats]) mirror.
            // If listing is still null after refresh it genuinely has none — proceed.
          }

          // ── Stage 1: aiConfig + settings/key in parallel (RAG after cfg resolves) ──
          // aiConfig is cached (300s TTL) so this is near-instant after first sync.
          // aiConfig failure is non-fatal — undefined → all builtins used.
          const [aiCfg, settings, geminiKey] = await Promise.all([
            getAiConfig(dbRef.current).catch((): AiChatConfig | undefined => undefined),
            getSettings(dbRef.current),
            getGeminiKey(),
          ])

          // Provider known now (before RAG): cloud Gemini has a ~1M-token context,
          // so widen the RAG budget/char-cap for it (these fields override the
          // pipeline builtins only when > 0). Local keeps the tighter aiCfg budget.
          isGeminiMode = settings.aiProvider === 'gemini' && geminiKey !== null
          const isGemini = isGeminiMode
          const ragCfg: AiChatConfig | undefined = isGemini
            ? {
                // Default block flags so ragBlocksEnabled is always present; aiCfg
                // (when loaded) overrides them, then the widened budgets win.
                ragBlocksEnabled: { flashcards: true, listings: true, courses: true, progress: true },
                ...(aiCfg ?? {}),
                ragTotalTokenBudget: Math.max(aiCfg?.ragTotalTokenBudget ?? 0, 2400),
                ragPerBlockCharCap: Math.max(aiCfg?.ragPerBlockCharCap ?? 0, 700),
              }
            : aiCfg

          // ── Stage 2: RAG pipeline with resolved cfg ────────────────────────
          // cfg enables block-disabling and budget overrides in the pipeline.
          // Retrieval uses the history-aware query so follow-ups fetch context.
          const { blocks, sources } = await buildRagContext(
            dbRef.current, retrievalQuery, effectiveMode, statsRef.current, ragCfg,
          )

          // Dev debug: log which sources contributed to the context + active overrides
          if (__DEV__) {
            console.log('[rag]', sources.join(','))
            const activeOverrides = aiCfg
              ? Object.entries(aiCfg)
                  .filter(([k, v]) => k.endsWith('Override') && v !== undefined)
                  .map(([k]) => k)
              : []
            if (activeOverrides.length > 0) console.log('[ai-config] overrides:', activeOverrides.join(', '))
          }

          // ── Empty-retrieval fallback → deterministic catalog enumeration ───
          // A factual-looking question (exams/scholarships/schools/subjects…)
          // that retrieved NOTHING would otherwise let the 1B answer ungrounded.
          // Enumerate the catalog from local data instead of hallucinating.
          if (!dataIntent && blocks.trim().length === 0 && looksFactual(retrievalQuery)) {
            const enumBlock =
              (await buildListingsEnumeration(dbRef.current, retrievalQuery))
              ?? (await buildSubjectsContext(dbRef.current))
            if (enumBlock) {
              if (controller.signal.aborted || assistantIdRef.current !== assistantId || !isMountedRef.current) return
              const enumText = stripTag(enumBlock)
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, text: enumText, isStreaming: false } : m
              ))
              setIsStreaming(false)
              void dbRef.current.transaction(async tx => {
                await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode: 'topic', createdAt: now })
                await tx.insert(chatMessages).values({ role: 'assistant', text: enumText, mode: 'topic', createdAt: now + 1 })
              }).then(() => scheduleWebPersist()).catch(() => {})
              return
            }
          }

          // ── Gemini cloud path ─────────────────────────────────────────────
          if (settings.aiProvider === 'gemini' && geminiKey !== null) {
            if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
            if (!isMountedRef.current) return

            const geminiMode = isMath ? 'math' : mode
            const systemPrompt = composeSystemPrompt(geminiMode, aiCfg)

            const userContent = buildGeminiUserContent(
              trimmed,
              blocks,
              historyForPrompt,
            )

            // Generous budgets so answers finish instead of getting cut off.
            // Gemini's own key → cost is the user's; the doubled-budget retry in
            // geminiClient still backstops a genuine overflow.
            const maxOutputTokens = isMath ? 1024 : 768

            const geminiOpts = { maxOutputTokens, temperature: isMath ? 0.05 : 0.2 }
            const reply = await generateGeminiReply(geminiKey, systemPrompt, userContent, geminiOpts)

            if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
            if (!isMountedRef.current) return

            // A Tagalog-heavy reply is often correct — don't discard it. Retry ONCE
            // forcing English; prefer the English retry, else fall back to the
            // original reply's best-available text (never the old canned re-ask).
            let best = reply.trim()
            if (isTagalogHeavy(reply)) {
              const retry = await generateGeminiReply(
                geminiKey,
                systemPrompt,
                userContent + '\n\n[INSTRUCTION] Your previous reply used Tagalog. Answer again in clear ENGLISH only.',
                geminiOpts,
              )
              if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
              if (!isMountedRef.current) return
              const retryText = retry.trim()
              if (retryText.length > 0 && !isTagalogHeavy(retryText)) {
                best = retryText // English retry — the good outcome
              } else if (best.length === 0 && retryText.length > 0) {
                best = retryText // original empty → use whatever the retry produced
              }
              // else keep `best` (the original reply) as the best-available text
            }

            const displayText = best.length === 0
              ? "I couldn't process that. Try rephrasing your question."
              : best

            // Grounding gate: on a factual question with retrieved context, reject
            // a fabricated date/amount/URL and show/persist the safe fallback.
            const groundedText = applyGroundingGate(displayText, retrievalQuery, blocks)

            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, text: groundedText, isStreaming: false } : m
            ))
            setIsStreaming(false)

            // Persist to DB — fire-and-forget
            void dbRef.current.transaction(async tx => {
              await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode, createdAt: now })
              await tx.insert(chatMessages).values({ role: 'assistant', text: groundedText, mode, createdAt: now + 1 })
            }).then(() => scheduleWebPersist()).catch(() => {})
            return
          }

          // ── Local model path ──────────────────────────────────────────────
          // buildChatPromptWithSystem wraps the Gemma-format assembler with a
          // custom system prompt from composeSystemPrompt (which applies remote overrides).
          const localMode = isMath ? 'math' : mode
          const localSystemPrompt = composeSystemPrompt(localMode, aiCfg)
          // buildChatPrompt uses the system prompt baked into its mode constants.
          // We supply the composed system prompt as part of the ragBlocks so it
          // leads all context (9th param path). Instead, use the overrideSystemPrompt param.
          const prompt = buildChatPrompt(
            mode,
            trimmed,
            undefined,       // dataContext — handled by pipeline
            historyForPrompt,
            undefined,       // retrieved — handled by pipeline
            undefined,       // listingsCtx — handled by pipeline
            undefined,       // courseCtx — handled by pipeline
            blocks,          // ragBlocks from the pipeline
            localSystemPrompt, // override system prompt (9th param, new)
          )

          // Math questions need a bigger budget (multi-step solutions exceed 96 tokens)
          // and tighter sampling (less hallucinated arithmetic).
          // Math needs the biggest budget (long step-by-step) with tight sampling.
          // Non-math uses the raised 320-token default from streamChatInference so
          // conversational answers don't get cut off mid-sentence.
          const samplerOptions = isMath
            ? { nPredict: 448, temperature: 0.05 }
            : undefined

          await streamChatInference(prompt, (tokenText) => {
            if (controller.signal.aborted) return
            bufferRef.current += parseChatChunk(tokenText)
            scheduleFlush()
          }, controller.signal, samplerOptions)

          if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
          if (!isMountedRef.current) return

          if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
          const finalChunk = bufferRef.current
          bufferRef.current = ''
          const totalText = (accumulatedRef.current + finalChunk).trim()
          accumulatedRef.current = ''

          // A Tagalog-heavy answer is often correct — don't discard it. Re-run the
          // local model ONCE with an English-forcing instruction appended to the
          // question (buffer to a string; no need to re-stream to the UI). Prefer
          // the English retry; else keep the original as the best-available text.
          let localBest = totalText
          if (isTagalogHeavy(totalText)) {
            const retryPrompt = buildChatPrompt(
              mode,
              trimmed + '\n\n[INSTRUCTION] Your previous reply used Tagalog. Answer again in clear ENGLISH only.',
              undefined,
              historyForPrompt,
              undefined,
              undefined,
              undefined,
              blocks,
              localSystemPrompt,
            )
            let retryText = ''
            await streamChatInference(retryPrompt, (tokenText) => {
              if (controller.signal.aborted) return
              retryText += parseChatChunk(tokenText)
            }, controller.signal, samplerOptions)

            if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
            if (!isMountedRef.current) return

            const retryTrim = retryText.trim()
            if (retryTrim.length > 0 && !isTagalogHeavy(retryTrim)) {
              localBest = retryTrim // English retry — the good outcome
            } else if (localBest.length === 0 && retryTrim.length > 0) {
              localBest = retryTrim // original empty → use whatever the retry produced
            }
            // else keep `localBest` (the original answer) as the best-available text
          }

          const displayText = localBest.length === 0
            ? "I couldn't process that. Try rephrasing your question."
            : localBest

          // Grounding gate: on a factual question with retrieved context, reject
          // a fabricated date/amount/URL and show/persist the safe fallback.
          const groundedText = applyGroundingGate(displayText, retrievalQuery, blocks)

          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, text: groundedText, isStreaming: false } : m
          ))
          setIsStreaming(false)

          // Persist to DB — fire-and-forget, DB failure does not affect UI
          void dbRef.current.transaction(async tx => {
            await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode, createdAt: now })
            await tx.insert(chatMessages).values({ role: 'assistant', text: groundedText, mode, createdAt: now + 1 })
          }).then(() => scheduleWebPersist()).catch(() => {})

        } catch (err) {
          if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
          if (!isMountedRef.current) return
          // For Gemini errors, err.message is already a student-friendly mapped message.
          // For local inference errors (model init/inference failed), show a clear message
          // directing the user to switch to Gemini in Settings.
          if (!isGeminiMode) {
            console.error('[kuya] local inference failed:', err)
          } else {
            console.warn('[useKuyaChat] gemini inference failed:', err instanceof Error ? err.message : 'unknown error')
          }
          const friendlyError = isGeminiMode && err instanceof Error
            ? err.message
            : "Kuya Baw's brain couldn't start on this phone. You can switch to a free Gemini key in Settings → AI Chat."
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: friendlyError }
              : m
          ))
          setIsStreaming(false)
        }
      })()
    })
  }, [isStreaming, scheduleFlush])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = null
    const finalChunk = bufferRef.current
    bufferRef.current = ''
    accumulatedRef.current = ''
    const id = assistantIdRef.current
    if (id && isMountedRef.current) {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, text: m.text + finalChunk, isStreaming: false } : m
      ))
    }
    setIsStreaming(false)
  }, [])

  const clearHistory = useCallback(async () => {
    await dbRef.current.delete(chatMessages)
    setMessages([])
  }, [])

  return { messages, send, abort, clearHistory, isStreaming, isModelReady }
}
