import { View, type ViewProps } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

interface Props extends ViewProps {
  children: React.ReactNode
  /** Add a soft elevation shadow (theme-aware). */
  elevated?: boolean
  /** Apply default inner padding (spacing.lg). */
  padded?: boolean
}

/** Consistent surface card: token radius/border/elevation, continuous corners. */
export function Card({ children, elevated = false, padded = true, style, ...rest }: Props) {
  const { theme: t } = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          padding: padded ? spacing.lg : 0,
          ...(elevated ? { boxShadow: t.shadowSm } : null),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
}
