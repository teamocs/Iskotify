import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  title: string
  /** One line under the title (e.g. "42s per question"). Shown while collapsed. */
  summary?: string
  /** Make the body a disclosure (collapsed by default). */
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
  testID?: string
}

/**
 * One Progress section: a sentence-case heading on a plain card. A
 * collapsible section follows the APG accordion pattern — a heading that
 * contains the disclosure button, which reports `expanded`.
 */
export function ProgressSection({ title, summary, collapsible = false, defaultOpen = false, children, testID }: Props) {
  const { theme: t } = useTheme()
  const [open, setOpen] = useState(!collapsible || defaultOpen)

  const heading = (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{title}</Text>
      {summary && (collapsible ? !open : true) ? (
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{summary}</Text>
      ) : null}
    </View>
  )

  return (
    <Card padded={false} testID={testID} style={{ overflow: 'hidden' }}>
      {collapsible ? (
        <View accessibilityRole="header">
          <Pressable
            onPress={() => setOpen(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={summary && !open ? `${title}, ${summary}` : title}
            accessibilityState={{ expanded: open }}
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressableState
              return [
                {
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56,
                  paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                  backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            {heading}
            <View {...decorative}>
              <Lineicons icon={open ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
            </View>
          </Pressable>
        </View>
      ) : (
        <View accessibilityRole="header" accessible accessibilityLabel={title} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
          {heading}
        </View>
      )}
      {open ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: collapsible ? 0 : spacing.xs }}>
          {children}
        </View>
      ) : null}
    </Card>
  )
}
