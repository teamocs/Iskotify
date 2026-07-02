/**
 * SyncErrorBanner — slim dismissible banner shown when the last sync attempt
 * failed (syncStatus.lastError != null) and no sync is currently running.
 *
 * Self-contained: reads useSyncStatus() itself; the parent only supplies
 * onRetry (typically () => void syncOnLaunch(db)).
 *
 * Dismissal is keyed off the error VALUE — dismissing hides the banner for the
 * current lastError string only, so a NEW (different) error re-shows it.
 * markSyncStart() clears lastError, so the banner also hides while a retry runs.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'

interface SyncErrorBannerProps {
  onRetry: () => void
}

export function SyncErrorBanner({ onRetry }: SyncErrorBannerProps) {
  const { lastError, isSyncing } = useSyncStatus()
  const { theme, typo } = useTheme()
  const insets = useSafeAreaInsets()

  // The exact error string the user dismissed. A different error won't match,
  // so the banner re-appears for new failures.
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  const visible = lastError != null && !isSyncing && lastError !== dismissedError
  if (!visible) return null

  return (
    <View
      style={[
        styles.container,
        {
          marginTop: insets.top + spacing.sm,
          backgroundColor: theme.dangerSurface,
          borderColor: theme.danger,
        },
      ]}
    >
      {/* The alert role lives on the Text (an accessibility element) so screen
          readers announce it while Retry/dismiss stay individually focusable. */}
      <Text
        accessibilityRole="alert"
        style={[styles.message, { color: theme.textPrimary, fontSize: typo.sm }]}
        maxFontSizeMultiplier={1.4}
      >
        Couldn't refresh data — check your connection.
      </Text>

      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry sync"
        hitSlop={8}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: theme.accentStrong },
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[styles.retryText, { color: theme.textInverse, fontSize: typo.sm }]}
          maxFontSizeMultiplier={1.4}
        >
          Retry
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setDismissedError(lastError)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss sync error"
        hitSlop={8}
        style={({ pressed }) => [styles.dismissBtn, pressed && styles.pressed]}
      >
        <Text
          style={[styles.dismissText, { color: theme.textSecondary, fontSize: typo.sm }]}
          maxFontSizeMultiplier={1.4}
        >
          ✕
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  message: {
    flex: 1,
    lineHeight: 18,
  },
  retryBtn: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  retryText: {
    fontWeight: '600',
  },
  dismissBtn: {
    padding: spacing.xs,
  },
  dismissText: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
})
