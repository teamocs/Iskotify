import { Children, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing } from '../ui/a11y'

/** Where a row sits in its inset group: corners round only at the ends. */
export type ChoicePosition = 'only' | 'first' | 'middle' | 'last'

/** The position of item `index` in a list of `count` (for virtualized lists). */
export function choicePosition(index: number, count: number): ChoicePosition {
  if (count <= 1) return 'only'
  if (index === 0) return 'first'
  if (index === count - 1) return 'last'
  return 'middle'
}

interface Props {
  label: string
  description?: string
  selected: boolean
  onPress: () => void
  /** `radio` — one of a group; `checkbox` — any number. */
  mode: 'radio' | 'checkbox'
  /** e.g. a 3-course cap reached: the row stays visible but cannot be picked. */
  disabled?: boolean
  /** Defaults to "label, description". */
  accessibilityLabel?: string
  /** Its place in an inset group (default `only`, a group of one). ChoiceGroup sets it. */
  position?: ChoicePosition
  testID?: string
}

function cornerStyle(position: ChoicePosition): ViewStyle {
  const top = position === 'only' || position === 'first'
  const bottom = position === 'only' || position === 'last'
  return {
    borderTopLeftRadius: top ? radius.group : 0,
    borderTopRightRadius: top ? radius.group : 0,
    borderBottomLeftRadius: bottom ? radius.group : 0,
    borderBottomRightRadius: bottom ? radius.group : 0,
  }
}

/**
 * An answer row in the iOS inset-group language (onboarding, consent, the
 * guest diagnostic): rows share one 18pt surface panel with hairline
 * separators inset to the text, ≥56pt tall and growing with Dynamic Type.
 * Selection is never colour alone: the indicator changes shape (empty ring →
 * filled dot / empty box → check), the row tints, and the state is exposed
 * as aria-checked. Space toggles it on web like a native radio/checkbox.
 */
export function ChoiceRow({
  label, description, selected, onPress, mode, disabled, accessibilityLabel, position = 'only', testID,
}: Props) {
  const { theme: t } = useTheme()

  const onKeyDown = (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault?.()
    if (!e.repeat && !disabled) onPress()
  }
  const webKeys = { onKeyDown } as Record<string, unknown>

  const ring = selected ? t.accent : t.inputBorder
  const separated = position === 'first' || position === 'middle'

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      {...webKeys}
      testID={testID}
      accessibilityRole={mode}
      accessibilityLabel={accessibilityLabel ?? (description ? `${label}, ${description}` : label)}
      aria-checked={selected}
      aria-disabled={!!disabled}
      style={({ pressed, hovered, focused }) => [
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingLeft: spacing.lg,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: selected
            ? t.accentSurface
            : pressed ? t.surface2 : hovered && !disabled ? t.surfaceSubtle : t.surface,
          opacity: disabled ? 0.5 : 1,
        },
        cornerStyle(position),
        focusRing(t.focusRing, focused),
      ]}
    >
      <View
        style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          alignSelf: 'stretch', paddingVertical: spacing.md, paddingRight: spacing.lg,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text role="body" style={selected ? weight('600') : null}>{label}</Text>
          {description ? <Text role="subheadline" color={t.textSecondary}>{description}</Text> : null}
        </View>
        <View
          {...decorative}
          testID="choice-indicator"
          style={{
            width: 24,
            height: 24,
            flexShrink: 0,
            borderRadius: mode === 'radio' ? radius.capsule : radius.chip - 2,
            borderCurve: mode === 'radio' ? undefined : 'continuous',
            borderWidth: 2,
            borderColor: ring,
            backgroundColor: mode === 'checkbox' && selected ? t.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected && mode === 'radio' ? (
            <View style={{ width: 12, height: 12, borderRadius: radius.capsule, backgroundColor: t.accent }} />
          ) : null}
          {selected && mode === 'checkbox' ? <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} /> : null}
        </View>
        {separated ? (
          <View
            {...decorative}
            testID="choice-separator"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.divider }}
          />
        ) : null}
      </View>
    </PressableScale>
  )
}

interface GroupProps {
  /** ChoiceRows. Each one's position is set from its place in the group. */
  children: ReactNode
  /** The group's accessible role and name (a radiogroup of radios). */
  accessibilityRole?: 'radiogroup'
  accessibilityLabel?: string
  style?: ViewStyle
}

/** A set of ChoiceRows on one inset-group panel, separators between them. */
export function ChoiceGroup({ children, accessibilityRole, accessibilityLabel, style }: GroupProps) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<Props>[]
  return (
    <View accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} style={style}>
      {rows.map((row, i) => cloneElement(row, { position: choicePosition(i, rows.length) }))}
    </View>
  )
}
