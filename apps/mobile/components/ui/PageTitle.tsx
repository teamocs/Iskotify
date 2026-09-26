import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { heading } from './a11y'

interface Props {
  title: string
  /** One orienting sentence under the title. */
  lead?: string
  /** Trailing node on the title row (a Badge, a count). Wraps under on narrow screens. */
  trailing?: React.ReactNode
  testID?: string
}

/**
 * A stack screen's page heading: the title as the page's only level-1
 * heading, then one quiet sentence. Titles wrap, they are never truncated.
 * Pair with <Screen header={<DetailTopBar bare … />}>.
 */
export function PageTitle({ title, lead, trailing, testID }: Props) {
  const { theme: t } = useTheme()
  return (
    <View testID={testID} style={{ gap: spacing.xs, paddingTop: spacing.xs, marginBottom: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs }}>
        <Text {...heading(1)} style={[textStyle('title', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
        {trailing}
      </View>
      {lead ? (
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{lead}</Text>
      ) : null}
    </View>
  )
}
