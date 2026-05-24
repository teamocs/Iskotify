import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { useHomeStats } from './useHomeStats'
import { streamChatInference, modelExists } from '../services/llm'
import {
  buildChatPrompt, parseChatChunk,
  type ChatMode,
} from '../services/chatPrompts'
import { buildProgressContext } from '../services/chatContext'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  isStreaming?: boolean
  error?: string
}

interface UseKuyaChat {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  messages: ChatMessage[]
  send: (text: string) => void
  abort: () => void
  isStreaming: boolean
  isModelReady: boolean
}

const FLUSH_INTERVAL_MS = 60
const MIN_QUESTION_LENGTH = 5

// High-confidence Tagalog tokens. A response with ≥3 hits is treated as
// language-mirroring failure (1.5B model echoed user's Tagalog input
// despite the English-only prompt) and gets overridden with a canned
// English message. Tokens chosen to minimize false positives in English
// text (e.g. "ng", "mga", "kong" don't appear as word-boundary matches
// inside common English words).
const TAGALOG_INDICATORS = /\b(kong|mong|akin|sayo|ikaw|siya|niya|mga|nang|kasi|dahil|naman|meron|pag-aaral|kumpanya|gobyerno|naging|magiging|gawin|mahalaga|nais|paano|hindi|wala|kaya|tara|opo|anong|saan|kelan|tayo|kayo|sila|natin|talaga)\b/gi

function isTagalogHeavy(text: string): boolean {
  const matches = text.match(TAGALOG_INDICATORS)
  return (matches?.length ?? 0) >= 3
}

export function useKuyaChat(): UseKuyaChat {
  const db = useDb()
  const stats = useHomeStats()
  const [mode, setModeState] = useState<ChatMode>('progress')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isModelReady, setIsModelReady] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const bufferRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assistantIdRef = useRef<string | null>(null)

  // Check model availability on mount
  useEffect(() => {
    isMountedRef.current = true
    void modelExists().then(exists => {
      if (isMountedRef.current) setIsModelReady(exists)
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
    const userMsg: ChatMessage = {
      id: `u-${now}`,
      role: 'user',
      text: trimmed,
      timestamp: now,
    }

    // Short-question guard: inputs under 5 chars don't give the 1.5B model
    // enough signal to answer correctly — it tends to hallucinate. Show a
    // direct English nudge instead of calling the model.
    if (trimmed.length < MIN_QUESTION_LENGTH) {
      const assistantMsg: ChatMessage = {
        id: `a-${now}`,
        role: 'assistant',
        text: 'Please ask a more specific question — try one of the suggestions below.',
        timestamp: now,
        isStreaming: false,
      }
      setMessages(prev => [...prev, userMsg, assistantMsg])
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

    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const dataCtx = mode === 'progress'
            ? await buildProgressContext(db, stats)
            : undefined
          const prompt = buildChatPrompt(mode, trimmed, dataCtx)

          await streamChatInference(prompt, (tokenText) => {
            if (controller.signal.aborted) return
            bufferRef.current += parseChatChunk(tokenText)
            scheduleFlush()
          }, controller.signal)

          // Skip finalization if the user aborted or moved on to another send
          if (controller.signal.aborted || assistantIdRef.current !== assistantId) return
          if (!isMountedRef.current) return

          // Final flush — safe to touch shared refs only after the staleness guard
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
          const finalChunk = bufferRef.current
          bufferRef.current = ''

          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId) return m
            const finalText = (m.text + finalChunk).trim()
            if (finalText.length === 0) {
              return {
                ...m,
                isStreaming: false,
                text: "I couldn't process that. Try rephrasing your question.",
              }
            }
            // Tagalog-output safety net: if the model ignored the English-only
            // rule and produced Tagalog-heavy text, override with a canned
            // English fallback so the user doesn't see hallucinated garbage.
            if (isTagalogHeavy(finalText)) {
              return {
                ...m,
                isStreaming: false,
                text: "Let me try that again — could you re-ask your question?",
              }
            }
            return { ...m, text: m.text + finalChunk, isStreaming: false }
          }))
          setIsStreaming(false)
        } catch (err) {
          // Skip error UI if the user aborted (intentional cancel — not a real error) or moved on
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
  }, [isStreaming, mode, db, stats, scheduleFlush])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = null
    const finalChunk = bufferRef.current
    bufferRef.current = ''
    const id = assistantIdRef.current
    if (id && isMountedRef.current) {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, text: m.text + finalChunk, isStreaming: false } : m
      ))
    }
    setIsStreaming(false)
  }, [])

  const setMode = useCallback((next: ChatMode) => {
    if (isStreaming) return  // lock during streaming
    setModeState(next)
  }, [isStreaming])

  return { mode, setMode, messages, send, abort, isStreaming, isModelReady }
}
