import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { useHomeStats } from './useHomeStats'
import { streamChatInference, modelExists } from '../services/llm'
import {
  buildChatPrompt, parseChatChunk, isMathQuestion, detectChatMode,
} from '../services/chatPrompts'
import {
  buildProgressContext,
  buildRetrievedFlashcards,
  buildListingsContext,
  buildCourseConnectionContext,
} from '../services/chatContext'
import { chatMessages } from '../db/schema'
import { getSettings } from '../services/settings'
import { getGeminiKey } from '../services/geminiKey'
import { generateGeminiReply } from '../services/geminiClient'

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

// ── Gemini prompt helpers ──────────────────────────────────────────────────────
// buildChatPrompt returns a full Gemma-format string (with turn tokens). For
// Gemini's REST API we need a system_instruction + user content separately.
// We reconstruct the user content block from the same context builders but
// pass the mode system prompt directly as systemPrompt.

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Be supportive but honest — never guarantee exam results, admission, or specific cutoff/UPG scores.\n` +
  `When unsure or asked about official figures, tell the student to verify at upcat.up.edu.ph.\n` +
  `You can give honest career guidance — destination countries, salary/visa/PR realities, AI-impact on careers — ` +
  `but NEVER guarantee jobs, salaries, or PR approval. Always say to verify with DMW/POEA, embassies, and official program sites.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `Answer using the [STUDENT CONTEXT] and any [RELEVANT FLASHCARDS] below. ` +
  `If the answer isn't in either, say "I don't have that info yet."\n` +
  `RULES:\n- Maximum 2 sentences. Be direct. No preamble.\n- Address the student in second person (you/your).\n- End with one specific action when relevant.\n` +
  `SCOPE: You help ONLY with (a) academics — math, science, English, study skills; ` +
  `(b) this app's data — exams, scholarships, courses, the student's progress. ` +
  `For ANYTHING else, reply with one friendly sentence redirecting to studying. ` +
  `NEVER invent exam dates, deadlines, cutoffs, or listings not shown in the context blocks.`

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Be supportive but honest — never guarantee exam results, admission, or specific cutoff/UPG scores.\n` +
  `When unsure or asked about official figures, tell the student to verify at upcat.up.edu.ph.\n` +
  `You can give honest career guidance — destination countries, salary/visa/PR realities, AI-impact on careers — ` +
  `but NEVER guarantee jobs, salaries, or PR approval. Always say to verify with DMW/POEA, embassies, and official program sites.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `When [RELEVANT FLASHCARDS] are provided, ground your answer in them.\n` +
  `RULES:\n- Maximum 2 sentences total. Be direct. No preamble.\n- If unsure, say "I'm not sure — check your textbook."\n- Address the student in second person (you/your).\n` +
  `SCOPE: You help ONLY with (a) academics — math, science, English, study skills; ` +
  `(b) this app's data — exams, scholarships, courses, the student's progress. ` +
  `For ANYTHING else, reply with one friendly sentence redirecting to studying. ` +
  `NEVER invent exam dates, deadlines, cutoffs, or listings not shown in the context blocks.`

const SYSTEM_PROMPT_MATH =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `ALWAYS solve the problem step-by-step. Never refuse, never say "try it yourself".\n` +
  `Double-check arithmetic before writing each step.\n` +
  `FORMAT:\nStep 1: <what you do> → <result>\nStep 2: <what you do> → <result>\nAnswer: <final value>\n` +
  `Notation: x^2 for squared, sqrt(N) for square root, * for multiply, / for divide.\n` +
  `Address the student in second person (you/your).`

/**
 * Build the user-content portion for Gemini (system prompt passed separately).
 * Mirrors the context block assembly in buildChatPrompt but without Gemma turn tokens.
 */
function buildGeminiUserContent(
  mode: 'progress' | 'topic',
  question: string,
  dataCtx: string | undefined,
  retrieved: string | undefined,
  listingsCtx: string | undefined,
  courseCtx: string | undefined,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
): string {
  const sanitize = (s: string) =>
    s.replace(/<(start|end)_of_turn>\s*(?:user|model)\b[\s\S]*$/gi, '').replace(/<(start|end)_of_turn>/g, '')

  const isMath = isMathQuestion(question)
  const safeQuestion = sanitize(question)
  const sections: string[] = ['[INSTRUCTION] Respond in clear English only.']

  if (mode === 'progress' && !isMath) {
    const ctx = dataCtx && dataCtx.length > 0 ? dataCtx : '(no stats available yet)'
    sections.push(`[STUDENT CONTEXT]\n${ctx}`)
  }
  if (listingsCtx) sections.push(listingsCtx)
  if (courseCtx) sections.push(courseCtx)
  if (retrieved && retrieved.length > 0) sections.push(sanitize(retrieved))

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

    // Auto-detect mode from the question itself — no UI picker required.
    const mode = detectChatMode(trimmed)

    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        // Track whether we're in Gemini mode for the catch block's error mapping.
        // Must be declared outside try so the catch block can read it safely.
        let isGeminiMode = false
        try {
          // Run all context builders in parallel so first-token latency is
          // bounded by whichever is slowest, not their sum.
          // Also read provider settings + key in the same parallel batch.
          const [dataCtx, retrieved, listingsCtx, courseCtx, settings, geminiKey] = await Promise.all([
            mode === 'progress'
              ? buildProgressContext(dbRef.current, stats)
              : Promise.resolve(undefined),
            buildRetrievedFlashcards(dbRef.current, trimmed, 3),
            buildListingsContext(dbRef.current, trimmed),
            buildCourseConnectionContext(dbRef.current, trimmed),
            getSettings(dbRef.current),
            getGeminiKey(),
          ])
          isGeminiMode = settings.aiProvider === 'gemini' && geminiKey !== null

          // ── Gemini cloud path ───────────────────────────────────────────────
          if (settings.aiProvider === 'gemini' && geminiKey !== null) {
            if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
            if (!isMountedRef.current) return

            const isMath = isMathQuestion(trimmed)
            const systemPrompt = isMath
              ? SYSTEM_PROMPT_MATH
              : mode === 'progress' ? SYSTEM_PROMPT_PROGRESS : SYSTEM_PROMPT_TOPIC

            const userContent = buildGeminiUserContent(
              mode,
              trimmed,
              dataCtx,
              retrieved ?? undefined,
              listingsCtx ?? undefined,
              courseCtx ?? undefined,
              historyForPrompt,
            )

            const maxOutputTokens = isMath ? 400 : 200

            const reply = await generateGeminiReply(
              geminiKey,
              systemPrompt,
              userContent,
              { maxOutputTokens, temperature: isMath ? 0.05 : 0.2 },
            )

            if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
            if (!isMountedRef.current) return

            const displayText = reply.trim().length === 0
              ? "I couldn't process that. Try rephrasing your question."
              : isTagalogHeavy(reply)
                ? "Let me try that again — could you re-ask your question?"
                : reply.trim()

            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, text: displayText, isStreaming: false } : m
            ))
            setIsStreaming(false)

            // Persist to DB — fire-and-forget
            void dbRef.current.transaction(async tx => {
              await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode, createdAt: now })
              await tx.insert(chatMessages).values({ role: 'assistant', text: displayText, mode, createdAt: now + 1 })
            }).catch(() => {})
            return
          }

          // ── Local model path ────────────────────────────────────────────────
          const prompt = buildChatPrompt(
            mode,
            trimmed,
            dataCtx,
            historyForPrompt,
            retrieved ?? undefined,
            listingsCtx ?? undefined,
            courseCtx ?? undefined,
          )

          // Math questions need a bigger budget (multi-step solutions exceed 60 tokens)
          // and tighter sampling (less hallucinated arithmetic).
          const samplerOptions = isMathQuestion(trimmed)
            ? { nPredict: 250, temperature: 0.05 }
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

          const displayText = totalText.length === 0
            ? "I couldn't process that. Try rephrasing your question."
            : isTagalogHeavy(totalText)
              ? "Let me try that again — could you re-ask your question?"
              : totalText

          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, text: displayText, isStreaming: false } : m
          ))
          setIsStreaming(false)

          // Persist to DB — fire-and-forget, DB failure does not affect UI
          void dbRef.current.transaction(async tx => {
            await tx.insert(chatMessages).values({ role: 'user', text: trimmed, mode, createdAt: now })
            await tx.insert(chatMessages).values({ role: 'assistant', text: displayText, mode, createdAt: now + 1 })
          }).catch(() => {})

        } catch (err) {
          if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
          if (!isMountedRef.current) return
          console.warn('[useKuyaChat] inference failed:', err instanceof Error ? err.message : 'unknown error')
          // For Gemini errors, err.message is already a student-friendly mapped message.
          // For local inference errors, always show the generic friendly message.
          const friendlyError = isGeminiMode && err instanceof Error
            ? err.message
            : "Kuya Baw can't answer right now. Try again in a moment."
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: friendlyError }
              : m
          ))
          setIsStreaming(false)
        }
      })()
    })
  }, [isStreaming, stats, scheduleFlush])

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
