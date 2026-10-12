import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react'
import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, radius, spacing, type Theme } from '../../theme/tokens'
import { pagePadding, useBreakpoint } from '../../hooks/useBreakpoint'
import { decorative, focusRing, heading } from './a11y'
import { PressableScale } from './Pressable'
import { Text } from './Text'

type IconData = Parameters<typeof Lineicons>[0]['icon']

// ── Position in a group ─────────────────────────────────────────────────────
// A row draws its separator only inside a group and never under the last row.
// A lone row (a ListRow in a Card, say) draws none.
interface RowPosition { grouped: boolean; last: boolean }
const RowPositionContext = createContext<RowPosition>({ grouped: false, last: true })

// ── IconTile ────────────────────────────────────────────────────────────────

export type IconTileTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

const TINTED: Record<IconTileTone, { bg: keyof Theme; fg: keyof Theme }> = {
  accent:  { bg: 'accentSurface',  fg: 'accentText' },
  success: { bg: 'successSurface', fg: 'successStrong' },
  warning: { bg: 'warningSurface', fg: 'warningStrong' },
  danger:  { bg: 'dangerSurface',  fg: 'dangerStrong' },
  neutral: { bg: 'surface2',       fg: 'textSecondary' },
}
// Solid tiles carry a white glyph; every fill here clears 4.5:1 against it.
const SOLID: Record<IconTileTone, keyof Theme> = {
  accent: 'accent', success: 'success', warning: 'warning', danger: 'danger', neutral: 'textSecondary',
}

export interface IconTileProps {
  icon: IconData
  /** Default `accent`. */
  tone?: IconTileTone
  /** A solid tone fill with a white glyph instead of the tinted default. */
  solid?: boolean
}

/** The 30pt rounded icon square that leads a settings-style row. Decorative. */
export function IconTile({ icon, tone = 'accent', solid }: IconTileProps) {
  const { theme: t } = useTheme()
  const bg = solid ? t[SOLID[tone]] : t[TINTED[tone].bg]
  const fg = solid ? t.textInverse : t[TINTED[tone].fg]
  return (
    <View
      testID="icon-tile"
      {...decorative}
      style={{
        width: layout.iconTile, height: layout.iconTile,
        borderRadius: radius.chip, borderCurve: 'continuous',
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Lineicons icon={icon} size={18} color={fg} />
    </View>
  )
}

// ── InsetGroup ──────────────────────────────────────────────────────────────

export interface InsetGroupProps {
  children: ReactNode
  /** Section title above the group, sentence case. Exposed as a heading. */
  header?: string
  /** Explanatory note under the group. */
  footer?: string
  /** Inset by the page gutter (default). Pass false inside an already-padded container. */
  inset?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * An iOS inset grouped list: rows on one surface panel (the 18pt group
 * radius, continuous corners) with hairline separators between them, an
 * optional footnote header and footer, inset from the screen edge by the
 * page gutter. Children are InsetRows (or ListRows).
 */
export function InsetGroup({ children, header, footer, inset = true, style, testID }: InsetGroupProps) {
  const { theme: t } = useTheme()
  const gutter = pagePadding(useBreakpoint())
  const rows = Children.toArray(children).filter(isValidElement)

  return (
    <View testID={testID} style={[{ marginHorizontal: inset ? gutter : 0, gap: spacing.sm - 2 }, style]}>
      {header ? (
        <Text role="footnote" color={t.textSecondary} {...heading(3)} style={{ paddingHorizontal: spacing.lg }}>
          {header}
        </Text>
      ) : null}
      <View
        testID="inset-group"
        style={{
          backgroundColor: t.surface,
          borderRadius: radius.group,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}
      >
        {rows.map((row, i) => (
          <RowPositionContext.Provider key={row.key ?? i} value={{ grouped: true, last: i === rows.length - 1 }}>
            {row}
          </RowPositionContext.Provider>
        ))}
      </View>
      {footer ? (
        <Text role="footnote" color={t.textSecondary} style={{ paddingHorizontal: spacing.lg }}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

// ── InsetRow ────────────────────────────────────────────────────────────────

export interface InsetRowProps {
  title: string
  /** Second line, textSecondary. */
  subtitle?: string
  /** A 30pt IconTile glyph. */
  icon?: IconData
  iconTone?: IconTileTone
  iconSolid?: boolean
  /** Any other leading node (Avatar, ProgressRing). Decorative for screen readers. */
  leading?: ReactNode
  /** Trailing value text (e.g. the current setting). The row's accessibility value. */
  value?: string
  /** Any other trailing node (Badge, StatNumber). */
  trailing?: ReactNode
  /** A trailing Switch: give both. The row becomes one named switch. */
  switchValue?: boolean
  onSwitchChange?: (value: boolean) => void
  onPress?: () => void
  /** Chevron: shown by default on pressable rows. */
  chevron?: boolean
  /** `button` (default) or `link` (opens a page outside the app's flow). */
  accessibilityRole?: 'button' | 'link'
  /** Defaults to "title, subtitle". */
  accessibilityLabel?: string
  /** On a switch row the subtitle is the hint unless this is given. */
  accessibilityHint?: string
  disabled?: boolean
  /** Lines the title and subtitle may wrap to (default 2). */
  numberOfLines?: number
  testID?: string
}

/**
 * One row of an inset group: [icon tile | leading] title/subtitle, then a
 * value, a custom node, a switch or a chevron. It is at least 44pt tall and
 * grows with Dynamic Type (minHeight, never height). Its separator sits in the
 * text column, so it starts at the text's leading edge, and it is hidden on
 * the last row. Pressable rows settle to 0.97 with a subtle tint.
 */
export function InsetRow({
  title, subtitle, icon, iconTone, iconSolid, leading, value, trailing, switchValue, onSwitchChange,
  onPress, chevron, accessibilityRole = 'button', accessibilityLabel, accessibilityHint, disabled,
  numberOfLines = 2, testID,
}: InsetRowProps) {
  const { theme: t } = useTheme()
  const { grouped, last } = useContext(RowPositionContext)
  const isSwitch = switchValue !== undefined && !!onSwitchChange
  const pressable = !!onPress && !isSwitch
  const showChevron = chevron ?? pressable
  const lead = icon ? <IconTile icon={icon} tone={iconTone} solid={iconSolid} /> : leading

  const texts = (
    <View
      style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.sm }}
      // A switch row speaks through its switch; don't read the title twice.
      {...(isSwitch ? decorative : null)}
    >
      <Text role="body" numberOfLines={numberOfLines}>{title}</Text>
      {subtitle ? (
        <Text role="subheadline" color={t.textSecondary} numberOfLines={numberOfLines}>{subtitle}</Text>
      ) : null}
    </View>
  )

  const content = (
    <>
      {lead ? (
        <View {...decorative} style={{ flexShrink: 0, alignSelf: 'center', marginRight: spacing.md }}>
          {lead}
        </View>
      ) : null}
      <View
        testID="inset-row-body"
        style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          paddingRight: spacing.lg,
        }}
      >
        {texts}
        {value ? (
          <Text role="body" color={t.textSecondary} numberOfLines={1} style={{ flexShrink: 1, maxWidth: '45%' }}>
            {value}
          </Text>
        ) : null}
        {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            disabled={disabled}
            thumbColor={t.surface}
            trackColor={{ false: t.inputBorder, true: t.accent }}
            ios_backgroundColor={t.inputBorder}
            accessibilityRole="switch"
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityHint={accessibilityHint ?? subtitle}
            aria-checked={switchValue}
            aria-disabled={!!disabled}
          />
        ) : null}
        {showChevron ? (
          <View testID="list-row-chevron" style={{ transform: [{ scaleX: -1 }] }} {...decorative}>
            <Lineicons icon={ChevronLeftOutlined} size={14} color={t.textTertiary} />
          </View>
        ) : null}
        {grouped && !last ? (
          <View
            testID="inset-row-separator"
            {...decorative}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: StyleSheet.hairlineWidth, backgroundColor: t.divider,
            }}
          />
        ) : null}
      </View>
    </>
  )

  const rowStyle: ViewStyle = {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: spacing.lg,
  }

  if (!pressable) {
    return (
      <View style={rowStyle} testID={testID ?? 'inset-row'} accessibilityLabel={isSwitch ? undefined : accessibilityLabel}>
        {content}
      </View>
    )
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      testID={testID ?? 'inset-row'}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      accessibilityValue={value ? { text: value } : undefined}
      aria-disabled={!!disabled}
      style={({ pressed, hovered, focused }) => {
        // Web hover is a lighter tint than press, so pointer users see the row is live.
        const fill = disabled ? null : pressed ? t.surface2 : hovered ? t.surfaceSubtle : null
        return [
          rowStyle,
          fill ? { backgroundColor: fill } : null,
          disabled ? { opacity: 0.5 } : null,
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      {content}
    </PressableScale>
  )
}
