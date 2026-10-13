import { useState } from 'react'
import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'
import { PressableScale } from '../ui/Pressable'
import { decorative, focusRing } from '../ui/a11y'

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
 * One Progress section: a sentence-case headline on a white 22pt card. A
 * collapsible section follows the APG accordion pattern — a heading that
 * contains the disclosure button, which reports `expanded`.
 */
export function ProgressSection({ title, summary, collapsible = false, defaultOpen = false, children, testID }: Props) {
  const { theme: t } = useTheme()
  const [open, setOpen] = useState(!collapsible || defaultOpen)

  const heading = (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text role="headline">{title}</Text>
      {summary && (collapsible ? !open : true) ? (
        <Text role="footnote" color={t.textSecondary}>{summary}</Text>
      ) : null}
    </View>
  )

  return (
    <Card padded={false} testID={testID} style={{ overflow: 'hidden' }}>
      {collapsible ? (
        <View accessibilityRole="header">
          <PressableScale
            onPress={() => setOpen(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={summary && !open ? `${title}, ${summary}` : title}
            aria-expanded={open}
            style={({ pressed, hovered, focused }) => [
              {
                flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.rowMinHeight + 12,
                paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            {heading}
            <View {...decorative}>
              <Lineicons icon={open ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
            </View>
          </PressableScale>
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
