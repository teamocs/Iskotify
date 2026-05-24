import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, BackHandler, Platform } from 'react-native'
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture'
import { setVisibilityAsync, setBehaviorAsync } from 'expo-navigation-bar'

export interface FocusModeState {
  isPaused: boolean
  resumeSession: () => void
  endSession: () => void
}

interface UseFocusModeArgs {
  enabled: boolean
  active: boolean
  onTimerPause: () => void
  onTimerResume: () => void
  onExitConfirmed: () => void
}

/**
 * Session lifecycle hook. Active only when `enabled && active`. While active:
 *   - Blocks screenshots / screen recording
 *   - Hides Android navigation bar (immersive)
 *   - Intercepts hardware back press with an Alert
 *   - Detects AppState backgrounding, pauses timer, requires user to tap Resume
 *
 * Caller renders the SessionPausedOverlay using {isPaused, resumeSession, endSession}.
 * The exit Alert is rendered internally via react-native Alert API.
 */
export function useFocusMode({
  enabled,
  active,
  onTimerPause,
  onTimerResume,
  onExitConfirmed,
}: UseFocusModeArgs): FocusModeState {
  const [isPaused, setIsPaused] = useState(false)
  const onExitConfirmedRef = useRef(onExitConfirmed)
  const onTimerPauseRef = useRef(onTimerPause)
  const onTimerResumeRef = useRef(onTimerResume)

  // Keep refs current so the back / appstate handlers always see latest callbacks
  useEffect(() => { onExitConfirmedRef.current = onExitConfirmed }, [onExitConfirmed])
  useEffect(() => { onTimerPauseRef.current = onTimerPause }, [onTimerPause])
  useEffect(() => { onTimerResumeRef.current = onTimerResume }, [onTimerResume])

  // Activation effect — runs only when enabled+active flip true.
  useEffect(() => {
    if (!enabled || !active) return

    void preventScreenCaptureAsync().catch(err => console.warn('[useFocusMode] prevent:', err))
    if (Platform.OS === 'android') {
      void setVisibilityAsync('hidden').catch(err => console.warn('[useFocusMode] nav hide:', err))
      void setBehaviorAsync('inset-swipe').catch(err => console.warn('[useFocusMode] nav behavior:', err))
    }

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Exit session?',
        'Your progress is saved. You can resume later.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Exit Session',
            style: 'destructive',
            onPress: () => onExitConfirmedRef.current(),
          },
        ],
      )
      return true  // consume the back press
    })

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        setIsPaused(true)
        onTimerPauseRef.current()
      }
      // Returning to 'active' does NOT auto-resume — user must tap Resume on the overlay
    })

    return () => {
      void allowScreenCaptureAsync().catch(err => console.warn('[useFocusMode] allow:', err))
      if (Platform.OS === 'android') {
        void setVisibilityAsync('visible').catch(err => console.warn('[useFocusMode] nav restore:', err))
      }
      backSub.remove()
      appStateSub.remove()
      setIsPaused(false)
    }
  }, [enabled, active])

  const resumeSession = useCallback(() => {
    setIsPaused(false)
    onTimerResumeRef.current()
  }, [])

  const endSession = useCallback(() => {
    onTimerPauseRef.current()
    // Caller handles navigation to results screen
  }, [])

  return { isPaused, resumeSession, endSession }
}
