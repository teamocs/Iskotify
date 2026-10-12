import type { Ref } from 'react'
import { Platform, Text as RNText, type TextProps } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { iosTextStyle, type IosTextRole } from '../../theme/tokens'

type DynamicTypeRamp = NonNullable<TextProps['dynamicTypeRamp']>

const RAMP: Record<IosTextRole, DynamicTypeRamp> = {
  largeTitle:  'largeTitle',
  title1:      'title1',
  title2:      'title2',
  title3:      'title3',
  headline:    'headline',
  body:        'body',
  callout:     'callout',
  subheadline: 'subheadline',
  footnote:    'footnote',
  caption:     'caption1',
  numeric:     'title2',
  numericLg:   'largeTitle',
}

/** The iOS Dynamic Type curve a role scales along. */
export function dynamicTypeRampFor(role: IosTextRole): DynamicTypeRamp {
  return RAMP[role]
}

// `role` here is the TYPE role and replaces RN's ARIA `role` prop; set an
// ARIA role with `accessibilityRole` (e.g. "header").
export interface RoleTextProps extends Omit<TextProps, 'role'> {
  /** React 19 passes ref as a prop; it reaches the native Text. */
  ref?: Ref<RNText>
  role: IosTextRole
  /** A theme token; defaults to textPrimary. */
  color?: string
  /** Navigation and dense chrome (tab labels, header titles): caps scaling at
   *  1.4x instead of 2x so the bar keeps its shape at the largest sizes. */
  chrome?: boolean
}

/**
 * Text in an iOS role (largeTitle … caption, numeric, numericLg). Scales with
 * Dynamic Type along the role's own curve on iOS and caps the font-scale
 * multiplier (2x content, 1.4x chrome) everywhere.
 */
export function Text({ role, color, chrome, style, maxFontSizeMultiplier, ...rest }: RoleTextProps) {
  const { theme: t } = useTheme()
  return (
    <RNText
      {...rest}
      dynamicTypeRamp={Platform.OS === 'ios' ? RAMP[role] : undefined}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (chrome ? 1.4 : 2)}
      style={[iosTextStyle(role, color ?? t.textPrimary), style]}
    />
  )
}
