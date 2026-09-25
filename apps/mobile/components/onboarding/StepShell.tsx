import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo, Platform, Pressable, ScrollView, Text, View, findNodeHandle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { decorative, focusRing, heading, type WebPressableState } from '../ui/a11y'
import { stepPosition, type StepId } from './flow'

// Native: lift the sticky Continue above the software keyboard. Web needs
// nothing (the browser resizes the viewport).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NativeKAV: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

/** Onboarding column: narrower than the 720 reading width, one question needs little room. */
const COLUMN = 560

interface Props {
  step: StepId
  title: string
  description?: string
  onBack?: () => void
  /** Optional steps: a "Skip" text button top-right (accessible name "Skip this question"). */
  onSkip?: () => void
  primaryLabel?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  primaryLoading?: boolean
  /** Scroll the body (default). Set false when the body owns a list. */
  scroll?: boolean
  children: React.ReactNode
}

/**
 * One onboarding question: back · "Step n of 9 · section" · skip, a progress
 * bar, the question as the page's level-1 heading, the answer controls, and a
 * sticky full-width Continue (the one primary action) that rides above the
 * keyboard. Screen-reader focus moves to the question on every step.
 */
export function StepShell({
  step, title, description, onBack, onSkip, primaryLabel, onPrimary, primaryDisabled, primaryLoading,
  scroll = true, children,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const gutter = pagePadding(bp)
  const pos = stepPosition(step)
  const titleRef = useRef<Text>(null)

  useEffect(() => {
    if (Platform.OS === 'web') return
    const id = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null
      if (node) AccessibilityInfo.setAccessibilityFocus(node)
    }, 150)
    return () => clearTimeout(id)
  }, [step])

  const column = { width: '100%' as const, maxWidth: COLUMN, alignSelf: 'center' as const, paddingHorizontal: gutter }

  const body = (
    <>
      <View style={[column, { paddingTop: spacing.xs }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, marginLeft: onBack ? -spacing.sm : 0 }}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressableState
                return [{
                  width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                }, focusRing(t.focusRing, focused)]
              }}
            >
              <View {...decorative}>
                <Lineicons icon={ChevronLeftOutlined} size={22} color={t.textPrimary} />
              </View>
            </Pressable>
          ) : null}
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: onBack ? spacing.xs : 0 }}>
            <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>
              {`Step ${pos.index} of ${pos.total}`}
            </Text>
            <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>{pos.section}</Text>
          </View>
          {onSkip ? (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip this question"
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressableState
                return [{
                  minHeight: 44, minWidth: 44, paddingHorizontal: spacing.md, borderRadius: radius.md,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                }, focusRing(t.focusRing, focused)]
              }}
            >
              <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.6}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <ProgressBar value={pos.index / pos.total} label={`Onboarding progress, step ${pos.index} of ${pos.total}`} height={4} />
        </View>
        <Text
          ref={titleRef}
          {...heading(1)}
          style={[textStyle('title', t.textPrimary), { marginTop: spacing.xxl }]}
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[textStyle('body', t.textSecondary), { marginTop: spacing.sm }]} maxFontSizeMultiplier={2}>
            {description}
          </Text>
        ) : null}
      </View>

      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xxl }}
        >
          <View style={column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[column, { flex: 1, paddingTop: spacing.lg }]}>{children}</View>
      )}

      {primaryLabel && onPrimary ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.bg }}>
          <View style={[column, { paddingVertical: spacing.md }]}>
            <Button
              label={primaryLabel}
              onPress={onPrimary}
              disabled={primaryDisabled}
              loading={primaryLoading}
              size="lg"
              fullWidth
            />
          </View>
        </View>
      ) : null}
    </>
  )

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
      {NativeKAV && Platform.OS !== 'web'
        ? <NativeKAV behavior="padding" style={{ flex: 1 }}>{body}</NativeKAV>
        : <View style={{ flex: 1 }}>{body}</View>}
    </SafeAreaView>
  )
}
