import { useCallback, useEffect, useRef, useState } from 'react'
import { useCoachContext } from '../providers/AiCoachProvider'
import { pickTemplate } from '../services/coachTemplates'

const TAP_DEBOUNCE_MS = 300

interface UseAiCoach {
  phrase: string
  onTap: () => void
}

export function useAiCoach(): UseAiCoach {
  const { stats, ringIndex, nextPhrase } = useCoachContext()
  const [phrase, setPhrase] = useState<string>(() => pickTemplate(stats, ringIndex))
  const lastTapAtRef = useRef(0)

  // Keep an initial Layer-1 phrase visible if the queue is still warming
  // Only re-derive the initial phrase if ringIndex hasn't advanced (i.e. user hasn't tapped yet)
  useEffect(() => {
    if (ringIndex === 0) {
      setPhrase(pickTemplate(stats, 0))
    }
  }, [stats, ringIndex])

  const onTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapAtRef.current < TAP_DEBOUNCE_MS) return
    lastTapAtRef.current = now
    const { text } = nextPhrase()
    setPhrase(text)
  }, [nextPhrase])

  return { phrase, onTap }
}
