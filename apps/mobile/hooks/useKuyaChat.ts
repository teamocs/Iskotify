import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { useHomeStats } from './useHomeStats'
import { streamChatInference, modelExists } from '../services/llm'
import {
  buildChatPrompt, parseChatChunk, isMathQuestion, detectChatMode,
} from '../services/chatPrompts'
import { buildProgressContext, buildRetrievedFlashcards } from '../services/chatContext'
import { chatMessages } from '../db/schema'

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

  // Check model availability + load chat history on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    isMountedRef.current = true
    void modelExists().then(exists => {
      if (isMountedRef.current) setIsModelReady(exists)
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
        try {
          // Run progress-context (DB read) and FTS5 retrieval in parallel so
          // first-token latency is bounded by whichever is slower, not their sum.
          const [dataCtx, retrieved] = await Promise.all([
            mode === 'progress'
              ? buildProgressContext(dbRef.current, stats)
              : Promise.resolve(undefined),
            buildRetrievedFlashcards(dbRef.current, trimmed, 3),
          ])
          const prompt = buildChatPrompt(mode, trimmed, dataCtx, historyForPrompt, retrieved ?? undefined)

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
          console.warn('[useKuyaChat] streamChatInference failed:', err)
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: "Kuya Baw can't answer right now. Try again in a moment." }
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
