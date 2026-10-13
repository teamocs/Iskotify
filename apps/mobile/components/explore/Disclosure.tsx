import { useState } from 'react'
import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing } from '../ui/a11y'

interface Props {
  title: string
  /** One-line summary shown while collapsed, so the student can skip it knowingly. */
  preview?: string
  defaultExpanded?: boolean
  children: React.ReactNode
}

/**
 * Collapsible section for secondary detail (About, Benefits…). A header
 * button (at least 56pt) that announces its expanded state; the chevron is
 * drawn and silent. No height animation: the body appears instantly, which
 * also respects Reduce Motion without a branch.
 */
export function Disclosure({ title, preview, defaultExpanded = false, children }: Props) {
  const { theme: t } = useTheme()
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.divider }}>
      <PressableScale
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={preview && !expanded ? preview : undefined}
        aria-expanded={expanded}
        style={({ focused }) => [
          {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.md,
          },
          focusRing(t.focusRing, focused),
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text role="headline">{title}</Text>
          {!expanded && preview ? (
            <Text role="footnote" color={t.textSecondary} numberOfLines={1}>{preview}</Text>
          ) : null}
        </View>
        <View {...decorative}>
          <Lineicons icon={expanded ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
        </View>
      </PressableScale>
      {expanded ? <View style={{ paddingBottom: spacing.lg }}>{children}</View> : null}
    </View>
  )
}
