import { InsetRow } from './InsetGroup'

interface Props {
  title: string
  subtitle?: string
  /** Leading node (icon, Avatar, ProgressRing). Decorative for screen readers. */
  leading?: React.ReactNode
  /** Trailing node (Badge, StatNumber, value text). */
  trailing?: React.ReactNode
  onPress?: () => void
  /** Chevron shows by default on pressable rows that navigate. */
  showChevron?: boolean
  /** Defaults to "title, subtitle". */
  accessibilityLabel?: string
  accessibilityHint?: string
  disabled?: boolean
  testID?: string
}

/**
 * A list row: leading → title/subtitle → trailing → chevron. Kept for its
 * existing call sites; it is an InsetRow (iOS redesign P3), so it is at least
 * 44pt tall, grows with Dynamic Type, and draws separators when it sits in an
 * InsetGroup (none on its own, e.g. inside a Card). New code uses InsetRow.
 */
export function ListRow({
  title, subtitle, leading, trailing, onPress, showChevron, accessibilityLabel, accessibilityHint, disabled, testID,
}: Props) {
  return (
    <InsetRow
      title={title}
      subtitle={subtitle}
      leading={leading}
      trailing={trailing}
      onPress={onPress}
      chevron={showChevron}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      testID={testID}
    />
  )
}
