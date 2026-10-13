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
 *
 * iOS redesign P4: a floating glass card (chrome, never in a list) in the
 * field radius, a danger icon tile so the state is not colour alone, text in
 * the iOS roles, and 44pt Retry / dismiss targets.
 */

import React, { useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined, CloudRefreshClockwiseOutlined } from '@lineiconshq/free-icons'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { useTheme } from '../theme/ThemeContext'
import { BACKUP_FAILED_MESSAGE } from '../services/syncStatus'
import { layout, radius, spacing, weight } from '../theme/tokens'
import { Glass } from './ui/Glass'
import { IconTile } from './ui/InsetGroup'
import { PressableScale } from './ui/Pressable'
import { Text } from './ui/Text'
import { decorative, focusRing } from './ui/a11y'

interface SyncErrorBannerProps {
  onRetry: () => void
}

export function SyncErrorBanner({ onRetry }: SyncErrorBannerProps) {
  const { lastError, isSyncing } = useSyncStatus()
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  // The exact error string the user dismissed. A different error won't match,
  // so the banner re-appears for new failures.
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  const visible = lastError != null && !isSyncing && lastError !== dismissedError
  if (!visible) return null

  return (
    <Glass
      variant="header"
      style={{
        marginTop: insets.top + spacing.sm,
        marginHorizontal: spacing.lg,
        borderRadius: radius.field,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: t.dangerBorder,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
      }}
    >
      <IconTile icon={CloudRefreshClockwiseOutlined} tone="danger" />
      {/* The alert role lives on the Text (an accessibility element) so screen
          readers announce it while Retry/dismiss stay individually focusable. */}
      <Text role="footnote" accessibilityRole="alert" chrome style={{ flex: 1, paddingVertical: spacing.xs }}>
        {lastError === BACKUP_FAILED_MESSAGE ? BACKUP_FAILED_MESSAGE : "Couldn't refresh data — check your connection."}
      </Text>

      <PressableScale
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry sync"
        style={({ pressed, focused }) => [
          {
            minHeight: layout.rowMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md,
            borderRadius: radius.capsule, backgroundColor: pressed ? t.surface2 : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]}
      >
        <Text role="subheadline" color={t.accentText} chrome style={weight('600')}>Retry</Text>
      </PressableScale>

      <PressableScale
        onPress={() => setDismissedError(lastError)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss sync error"
        style={({ pressed, focused }) => [
          {
            width: layout.headerButton.hit, height: layout.headerButton.hit, alignItems: 'center', justifyContent: 'center',
            borderRadius: radius.capsule, backgroundColor: pressed ? t.surface2 : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]}
      >
        <View {...decorative}>
          <Lineicons icon={XmarkOutlined} size={16} color={t.textSecondary} />
        </View>
      </PressableScale>
    </Glass>
  )
}
