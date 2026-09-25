import type { StyleProp, ViewStyle } from 'react-native'
import { Button } from './Button'

type Variant = 'primary' | 'secondary' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  /** Span the full width of the container (e.g. sticky footers). Otherwise wraps content. */
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  /** Optional leading icon element. */
  leading?: React.ReactNode
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Legacy API kept for existing call sites — a thin wrapper over `Button`
 * (pill, lg). New code should use `Button shape="pill"` directly.
 */
export function PillButton({ leading, ...rest }: Props) {
  return <Button {...rest} icon={leading} shape="pill" size="lg" />
}
