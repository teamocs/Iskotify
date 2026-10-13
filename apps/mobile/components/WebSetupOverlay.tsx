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
// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Platform, View, Image, ActivityIndicator, StyleSheet } from 'react-native'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { markSyncDone } from '../services/syncStatus'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing } from '../theme/tokens'
import { Button } from './ui/Button'
import { Text } from './ui/Text'

const SAFETY_TIMEOUT_MS = 15_000

export function WebSetupOverlay() {
  // Hooks run unconditionally (Rules of Hooks), then we guard below. On native
  // this is harmless: useSyncStatus reads a module-level store and useTheme reads
  // context, and the Platform + visibility guards return null so nothing renders.
  const status = useSyncStatus()
  const { theme } = useTheme()

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

  // A full-screen page (not glass): nothing usable sits behind it yet.
  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.bg }]}>
      <Image
        source={require('../assets/images/icon.png')}
        style={styles.icon}
        accessibilityIgnoresInvertColors
      />

      <ActivityIndicator size="large" color={theme.accentText} />

      <View style={styles.words}>
        <Text role="title2" accessibilityRole="header" style={styles.center} maxFontSizeMultiplier={1.4}>
          Setting up Iskotify
        </Text>
        <Text role="subheadline" color={theme.textSecondary} style={styles.center} maxFontSizeMultiplier={1.4}>
          Fetching the latest exams, scholarships and study decks. This only happens once on a new device.
        </Text>
      </View>

      {showContinue ? (
        <View style={styles.continueBlock}>
          <Text role="footnote" color={theme.textSecondary} style={styles.center} maxFontSizeMultiplier={1.4}>
            Taking longer than usual…
          </Text>
          <Button
            label="Continue anyway"
            variant="secondary"
            onPress={() => markSyncDone()}
            accessibilityLabel="Continue to the app without waiting for the sync to finish"
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: spacing.xxxl,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: radius.card,
    borderCurve: 'continuous',
  },
  words: {
    gap: spacing.md,
    maxWidth: 360,
  },
  center: {
    textAlign: 'center',
  },
  continueBlock: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
  },
})
