import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  title: string
  /** One-line summary shown while collapsed, so the student can skip it knowingly. */
  preview?: string
  defaultExpanded?: boolean
  children: React.ReactNode
}

/**
 * Collapsible section for secondary detail (About, Benefits…). A 44pt header
 * button that announces its expanded state; the chevron is drawn and silent.
 * No height animation: the body appears instantly, which also respects
 * reduced motion without a branch.
 */
export function Disclosure({ title, preview, defaultExpanded = false, children }: Props) {
  const { theme: t } = useTheme()
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.divider }}>
      <Pressable
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={preview && !expanded ? preview : undefined}
        accessibilityState={{ expanded }}
        // react-native-web ignores accessibilityState; aria-expanded reaches the DOM.
        aria-expanded={expanded}
        style={(state) => {
          const { pressed, focused } = state as WebPressableState
          return [
            {
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.md,
              opacity: pressed ? 0.7 : 1,
            },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.6}>{title}</Text>
          {!expanded && preview ? (
            <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {preview}
            </Text>
          ) : null}
        </View>
        <View {...decorative}>
          <Lineicons icon={expanded ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
        </View>
      </Pressable>
      {expanded ? <View style={{ paddingBottom: spacing.lg }}>{children}</View> : null}
    </View>
  )
}
