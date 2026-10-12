import { useRef, useState } from 'react'
import { View, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle, weight } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'
import { Text } from './Text'

interface BaseProps {
  value: string
  onChangeText: (text: string) => void
  /** Keyboard "search" key. */
  onSubmit?: () => void
  /** A short example — never the field's name (DESIGN.md: a placeholder is not a label). */
  placeholder: string
  /** Show a spinner at the trailing edge (e.g. while results load). */
  busy?: boolean
  testID?: string
}

/** Name the field with a visible `label`, an `accessibilityLabel`, or both. */
export type SearchFieldProps = BaseProps & (
  | { label: string; accessibilityLabel?: string }
  | { label?: undefined; accessibilityLabel: string }
)

/**
 * The app's search input: a drawn search icon, a named field (a visible
 * label above it, or an accessibility label when the screen already says
 * what is searched), and a 44pt labelled clear button while there is text.
 * The 12pt field radius with continuous corners; the edge is `inputBorder`
 * (3:1 on every ground) and thickens to the focus colour while focused.
 */
export function SearchField({
  value, onChangeText, onSubmit, placeholder, label, accessibilityLabel, busy, testID,
}: SearchFieldProps) {
  const { theme: t } = useTheme()
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput | null>(null)

  const field = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 48,
        paddingLeft: focused ? spacing.md - 1 : spacing.md,
        paddingRight: spacing.xs,
        borderRadius: radius.field,
        borderCurve: 'continuous',
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? t.focusRing : t.inputBorder,
        backgroundColor: t.surface,
      }}
    >
      <View {...decorative}>
        <Lineicons icon={Search1Outlined} size={18} color={t.textSecondary} />
      </View>
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.textTertiary}
        accessibilityLabel={accessibilityLabel ?? label}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxFontSizeMultiplier={1.6}
        style={[
          textStyle('body', t.textPrimary),
          { flex: 1, minHeight: 44, paddingVertical: spacing.sm },
          // The container draws the focus state; drop the browser's own outline.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      {busy ? <ActivityIndicator size="small" color={t.accentText} accessibilityLabel="Ranking results" /> : null}
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={(state) => {
            const { pressed, focused: kbd } = state as WebPressableState
            return [
              {
                width: 44, height: 44, borderRadius: radius.capsule,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, kbd),
            ]
          }}
        >
          <View {...decorative}>
            <Lineicons icon={XmarkOutlined} size={16} color={t.textSecondary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  )

  if (!label) return field

  return (
    <View style={{ gap: spacing.xs }}>
      {/* Pressing the label focuses the field, like <label for>. Not a separate
          accessible element: the input already carries the label as its name. */}
      <Pressable onPress={() => inputRef.current?.focus()} accessible={false} focusable={false}>
        <Text role="footnote" style={weight('600')}>{label}</Text>
      </Pressable>
      {field}
    </View>
  )
}
