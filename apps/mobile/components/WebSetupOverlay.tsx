/**
 * WebSetupOverlay — web-only full-screen overlay shown while the FIRST catalog
 * sync runs on a fresh browser/device session.
 *
 * Gating: only visible when `isSyncing && !firstSyncDone`. The overlay is
 * pre-suppressed for all non-eligible entries (onboarding, sign-in, returning
 * users with local data) by calling markFirstSyncDone() before syncOnLaunch in
 * _layout.tsx — so this component never needs to know about routing context.
 *
 * Safety escape: if the sync is taking longer than 15 s (e.g. a very slow
 * network), a "Continue anyway" button appears. Pressing it calls markSyncDone()
 * which flips firstSyncDone=true and hides the overlay immediately.
 *
 * Native: returns null unconditionally — the Platform guard is the very first
 * statement so the rest of the module is never evaluated on native.
 */

import React, { useEffect, useState } from 'react'
import {
  Platform,
  View,
  Image,
  ActivityIndicator,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { markSyncDone } from '../services/syncStatus'
import { useTheme } from '../theme/ThemeContext'

const SAFETY_TIMEOUT_MS = 15_000

export function WebSetupOverlay() {
  // Hooks run unconditionally (Rules of Hooks), then we guard below. On native
  // this is harmless: useSyncStatus reads a module-level store and useTheme reads
  // context, and the Platform + visibility guards return null so nothing renders.
  const status = useSyncStatus()
  const { theme, typo } = useTheme()

  const isVisible = status.isSyncing && !status.firstSyncDone

  const [showContinue, setShowContinue] = useState(false)

  // Arm the safety timer only while the overlay is actually showing.
  useEffect(() => {
    if (!isVisible) {
      setShowContinue(false)
      return
    }
    const id = setTimeout(() => setShowContinue(true), SAFETY_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [isVisible])

  // Web-only guard: return null on native AND when not visible.
  if (Platform.OS !== 'web') return null
  if (!isVisible) return null

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/icon.png')}
        style={styles.icon}
        accessibilityIgnoresInvertColors
      />

      <ActivityIndicator
        size="large"
        color={theme.accentText}
        style={styles.spinner}
      />

      <Text
        style={[styles.title, { fontSize: typo.lg, color: theme.textPrimary }]}
        maxFontSizeMultiplier={1.4}
      >
        Setting up Iskotify
      </Text>

      <Text
        style={[styles.subtitle, { fontSize: typo.sm, color: 'rgba(255,255,255,0.7)' }]}
        maxFontSizeMultiplier={1.4}
      >
        Fetching the latest exams, scholarships and study decks. This only happens once on a new device.
      </Text>

      {showContinue ? (
        <View style={styles.continueBlock}>
          <Text
            style={[styles.slowText, { fontSize: typo.xs, color: 'rgba(255,255,255,0.5)' }]}
            maxFontSizeMultiplier={1.4}
          >
            Taking longer than usual…
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.continueBtn,
              { borderColor: 'rgba(255,255,255,0.35)' },
              pressed && styles.continueBtnPressed,
            ]}
            onPress={() => markSyncDone()}
            accessibilityRole="button"
            accessibilityLabel="Continue to the app without waiting for the sync to finish"
          >
            <Text
              style={[styles.continueBtnText, { fontSize: typo.sm, color: theme.textPrimary }]}
              maxFontSizeMultiplier={1.4}
            >
              Continue anyway
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 32,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 20,
  },
  spinner: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  continueBlock: {
    marginTop: 28,
    alignItems: 'center',
    gap: 12,
  },
  slowText: {
    textAlign: 'center',
  },
  continueBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  continueBtnPressed: {
    opacity: 0.6,
  },
  continueBtnText: {
    fontWeight: '600',
    textAlign: 'center',
  },
})
