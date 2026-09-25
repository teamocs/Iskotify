import { Button } from './Button'

type Variant = 'primary' | 'secondary' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  accessibilityLabel?: string
}

/**
 * Legacy API kept for existing call sites — a thin wrapper over `Button`
 * (rounded, md). New code should use `Button` directly.
 */
export function AppButton(props: Props) {
  return <Button {...props} shape="rounded" size="md" />
}
