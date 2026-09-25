import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Layers1Outlined, Trash3Outlined, ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Badge } from '../ui/Badge'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  name: string
  subtitle: string
  dueCount: number
  onOpen: () => void
  onDelete: () => void
}

/**
 * A saved-deck row. Same anatomy as ListRow, plus a visible, labelled delete
 * control as a SIBLING of the row button (never nested inside it) — deleting
 * used to be long-press only, which screen-reader and keyboard users can't find.
 * (ListRow is a frozen primitive without a secondary action slot.)
 */
export function DeckRow({ name, subtitle, dueCount, onOpen, onDelete }: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${subtitle}${dueCount > 0 ? `, ${dueCount} due` : ''}`}
        style={(state) => {
          const { pressed, focused } = state as WebPressableState
          return [
            {
              flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              paddingVertical: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.xs,
              backgroundColor: pressed ? t.surface2 : 'transparent',
            },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <View {...decorative} style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Lineicons icon={Layers1Outlined} size={18} color={t.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={2}>{name}</Text>
          <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={2}>{subtitle}</Text>
        </View>
        {dueCount > 0 ? <Badge label={`${dueCount} due`} tone="warning" /> : null}
        <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
          <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textTertiary} />
        </View>
      </Pressable>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${name}`}
        style={(state) => {
          const { pressed, focused } = state as WebPressableState
          return [
            {
              width: 44, height: 44, marginRight: spacing.xs, borderRadius: radius.pill,
              alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent',
            },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <Lineicons icon={Trash3Outlined} size={18} color={t.textSecondary} />
      </Pressable>
    </View>
  )
}
