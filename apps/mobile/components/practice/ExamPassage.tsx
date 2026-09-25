import { useState } from 'react'
import { View, Text, Pressable, ScrollView, Modal } from 'react-native'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined, ExpandArrow1Outlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

/**
 * Reading passage for comprehension questions. Inline it is a bounded,
 * scrollable panel above the question (so the question stays reachable);
 * "Read full" opens a distraction-free reader at a comfortable measure.
 */
export function ExamPassage({ passage }: { passage: string }) {
  const { theme: t } = useTheme()
  const insets = useSafeInsets()
  const reduced = useReducedMotion()
  const [expanded, setExpanded] = useState(true)
  const [reader, setReader] = useState(false)

  const control = (pressed: boolean, focused?: boolean) => [
    {
      minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs,
      paddingHorizontal: spacing.md, borderRadius: radius.pill,
      backgroundColor: pressed ? t.surface2 : 'transparent',
    },
    focusRing(t.focusRing, focused),
  ]

  return (
    <View
      style={{
        backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
        borderRadius: radius.lg, borderCurve: 'continuous', marginBottom: spacing.lg, overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.xs, gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[textStyle('label', t.textSecondary), { flex: 1 }]} maxFontSizeMultiplier={1.5}>
          Passage
        </Text>
        <Pressable
          onPress={() => setExpanded(e => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide passage' : 'Show passage'}
          aria-expanded={expanded}
          style={(s) => { const { pressed, focused } = s as WebPressableState; return control(pressed, focused) }}
        >
          <View {...decorative}>
            <Lineicons icon={expanded ? ChevronUpOutlined : ChevronDownOutlined} size={16} color={t.textSecondary} />
          </View>
          <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.4}>{expanded ? 'Hide' : 'Show'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setReader(true)}
          accessibilityRole="button"
          accessibilityLabel="Read the full passage"
          style={(s) => { const { pressed, focused } = s as WebPressableState; return control(pressed, focused) }}
        >
          <View {...decorative}>
            <Lineicons icon={ExpandArrow1Outlined} size={16} color={t.accentText} />
          </View>
          <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.4}>Read full</Text>
        </Pressable>
      </View>

      {expanded ? (
        <ScrollView
          style={{ maxHeight: 240 }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={1.8}>{passage}</Text>
        </ScrollView>
      ) : null}

      <Modal
        visible={reader}
        animationType={reduced ? 'none' : 'fade'}
        onRequestClose={() => setReader(false)}
        presentationStyle="fullScreen"
      >
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingVertical: spacing.sm,
              borderBottomWidth: 1, borderBottomColor: t.divider,
            }}
          >
            <Text accessibilityRole="header" style={[textStyle('headline', t.textPrimary), { flex: 1 }]} maxFontSizeMultiplier={1.4}>
              Passage
            </Text>
            <Pressable
              onPress={() => setReader(false)}
              accessibilityRole="button"
              accessibilityLabel="Close passage"
              style={(s) => {
                const { pressed, focused } = s as WebPressableState
                return [
                  { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <Lineicons icon={XmarkOutlined} size={20} color={t.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              width: '100%', maxWidth: 680, alignSelf: 'center',
              paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl,
            }}
          >
            <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>{passage}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
