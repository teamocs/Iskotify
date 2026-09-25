import { useState } from 'react'
import { View, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  value: string
  onChangeText: (text: string) => void
  /** Keyboard "search" key. */
  onSubmit?: () => void
  /** A short example — never the field's name (DESIGN.md: a placeholder is not a label). */
  placeholder: string
  /** The field's accessible name, e.g. "Search scholarships". */
  accessibilityLabel: string
  /** Show a spinner at the trailing edge (e.g. on-device AI ranking). */
  busy?: boolean
  testID?: string
}

/**
 * Explore's search input: a drawn search icon, a named field, and a 44pt
 * labelled clear button while there is text. The border thickens and turns
 * the focus colour while focused, so the field shows where typing will land.
 */
export function SearchField({ value, onChangeText, onSubmit, placeholder, accessibilityLabel, busy, testID }: Props) {
  const { theme: t } = useTheme()
  const [focused, setFocused] = useState(false)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 48,
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        borderRadius: radius.md,
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
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.textTertiary}
        accessibilityLabel={accessibilityLabel}
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
                width: 44, height: 44, borderRadius: radius.pill,
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
}
