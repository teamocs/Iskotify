import { useEffect, useRef } from 'react'
// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import {
  AccessibilityInfo, Image, Platform, Pressable, ScrollView, Text, View, findNodeHandle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { decorative, focusRing, heading, type WebPressableState } from '../ui/a11y'
import { TAGLINE } from '../auth/BrandPanel'
import { ONBOARDING_STEPS, stepPosition, type Section, type StepId } from './flow'

// Native: lift the sticky Continue above the software keyboard. Web needs
// nothing (the browser resizes the viewport).
const NativeKAV: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

/** Onboarding column: narrower than the 720 reading width, one question needs little room. */
const COLUMN = 560

const SECTIONS: { name: Section; count: number }[] = (['About you', 'Your goal', 'Scholarship match', 'Quick check'] as Section[])
  .map(name => ({ name, count: ONBOARDING_STEPS.filter(s => s.section === name).length }))

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
 * Wide windows: where the student is in the four sections. Done sections get a
 * check, the current one is filled and marked aria-current="step".
 */
function SectionRail({ current }: { current: Section }) {
  const { theme: t } = useTheme()
  const currentIdx = SECTIONS.findIndex(s => s.name === current)
  return (
    <View
      testID="section-rail"
      style={{
        width: 320, backgroundColor: t.surface, borderRadius: radius.xxl, borderCurve: 'continuous',
        padding: spacing.xxl, justifyContent: 'space-between', gap: spacing.xxl,
        borderWidth: 1, borderColor: t.border,
      }}
    >
      <View style={{ gap: spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={{ width: 32, height: 32, borderRadius: radius.sm }}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.4}>Iskotify</Text>
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.4}>Let&apos;s set up your plan</Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
            Four short parts. Your answers save as you go.
          </Text>
        </View>
        <View>
          {SECTIONS.map((s, i) => {
            const done = i < currentIdx
            const isCurrent = i === currentIdx
            return (
              <View
                key={s.name}
                testID={`section-${s.name}`}
                aria-current={isCurrent ? 'step' : undefined}
                accessible
                accessibilityLabel={`${s.name}, ${done ? 'done' : isCurrent ? 'current' : 'next'}`}
                style={{ flexDirection: 'row', gap: spacing.md, minHeight: 56 }}
              >
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isCurrent ? t.accent : done ? t.accentSurface : 'transparent',
                      borderWidth: isCurrent || done ? 0 : 1.5, borderColor: t.inputBorder,
                    }}
                  >
                    {done ? <Lineicons icon={CheckOutlined} size={14} color={t.accentText} /> : (
                      <Text style={textStyle('label', isCurrent ? t.textInverse : t.textSecondary)} maxFontSizeMultiplier={1.2}>
                        {String(i + 1)}
                      </Text>
                    )}
                  </View>
                  {i < SECTIONS.length - 1 ? (
                    <View style={{ flex: 1, width: 2, marginVertical: spacing.xs, backgroundColor: done ? t.accentBorder : t.divider }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingTop: 4, paddingBottom: spacing.md }}>
                  <Text style={textStyle(isCurrent ? 'titleSm' : 'label', isCurrent ? t.textPrimary : t.textSecondary)} maxFontSizeMultiplier={1.4}>
                    {s.name}
                  </Text>
                  <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>
                    {s.count === 1 ? '1 question' : `${s.count} questions`}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
      <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.4}>{TAGLINE}</Text>
    </View>
  )
}

/**
 * One onboarding question: back · "Step n of 9 · section" · skip, a progress
 * bar, the question as the page's level-1 heading, the answer controls, and a
 * full-width Continue (the one primary action) that rides above the keyboard.
 * Screen-reader focus moves to the question on every step.
 *
 * Phones and tablets: one column, Continue pinned to the bottom edge. Wide
 * windows: the question sits in a card with its Continue inside it, beside a
 * rail of the four sections, instead of a thin column stranded on a 1440px
 * field with a full-bleed bar at the bottom of the window.
 */
export function StepShell({
  step, title, description, onBack, onSkip, primaryLabel, onPrimary, primaryDisabled, primaryLoading,
  scroll = true, children,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const wide = bp === 'expanded'
  const gutter = wide ? spacing.xxxl : pagePadding(bp)
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

  const column = { width: '100%' as const, maxWidth: wide ? undefined : COLUMN, alignSelf: 'center' as const, paddingHorizontal: gutter }

  const body = (
    <>
      <View style={[column, { paddingTop: wide ? spacing.xl : spacing.xs }]}>
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
        <View style={wide ? undefined : { borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.bg }}>
          <View style={[column, { paddingVertical: wide ? spacing.xl : spacing.md }]}>
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

  if (wide) {
    const frame = (
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', padding: spacing.xxl, gap: spacing.xxl }}>
        <SectionRail current={pos.section} />
        <View
          style={{
            flex: 1, maxWidth: 720, backgroundColor: t.surface, borderRadius: radius.xxl, borderCurve: 'continuous',
            boxShadow: t.shadowMd, overflow: 'hidden',
          }}
        >
          {body}
        </View>
      </View>
    )
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
        {NativeKAV && Platform.OS !== 'web' ? <NativeKAV behavior="padding" style={{ flex: 1 }}>{frame}</NativeKAV> : frame}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
      {NativeKAV && Platform.OS !== 'web'
        ? <NativeKAV behavior="padding" style={{ flex: 1 }}>{body}</NativeKAV>
        : <View style={{ flex: 1 }}>{body}</View>}
    </SafeAreaView>
  )
}
