import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, weight } from '../../theme/tokens'
import { Text } from '../ui/Text'
import { decorative } from '../ui/a11y'
import { schoolInitials } from './exploreModel'

interface Props {
  name: string
  acronym?: string | null
  /** 44 in a row (default), 72 on the school sheet. */
  size?: 44 | 72
  testID?: string
}

/**
 * A school's logo tile: its initials on the accent tint, in a continuous
 * rounded square. Decorative (the row or heading beside it names the school).
 * The catalog has no logo images, so initials are the honest stand-in.
 */
export function LogoTile({ name, acronym, size = 44, testID = 'logo-tile' }: Props) {
  const { theme: t } = useTheme()
  const big = size === 72
  return (
    <View
      testID={testID}
      {...decorative}
      style={{
        width: size, height: size,
        borderRadius: big ? radius.card : radius.field,
        borderCurve: 'continuous',
        backgroundColor: big ? t.surface : t.accentSurface,
        borderWidth: big ? 1 : 0,
        borderColor: t.border,
        boxShadow: big ? t.shadowSm : undefined,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text role={big ? 'title2' : 'footnote'} color={t.accentText} chrome numberOfLines={1} style={weight('700')}>
        {schoolInitials(name, acronym)}
      </Text>
    </View>
  )
}
