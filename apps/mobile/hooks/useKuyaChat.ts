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

          // Final flush
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
          const finalChunk = bufferRef.current
          bufferRef.current = ''

          if (!isMountedRef.current) return
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId) return m
            const finalText = (m.text + finalChunk).trim()
            if (finalText.length === 0) {
              return {
                ...m,
                isStreaming: false,
                text: 'Hmm, hindi ko ma-process yan. Try mong i-rephrase!',
              }
            }
            return { ...m, text: m.text + finalChunk, isStreaming: false }
          }))
          setIsStreaming(false)
        } catch (err) {
          if (!isMountedRef.current) return
          console.warn('[useKuyaChat] streamChatInference failed:', err)
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: "Kuya Baw can't answer right now. Try again sa moment." }
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
