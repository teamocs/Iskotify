import { forwardRef, useId, useState } from 'react'
import { View, Text, TextInput, Pressable, Platform, type TextInputProps } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { EyeOutlined, EyeSolid } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** Visible label. Also the accessible name (WCAG 2.5.3: the name contains the visible text). */
  label: string
  /** Helper line under the field (format, range). Linked with aria-describedby. */
  hint?: string
  /** Error under the field. Announced, marks the field invalid, turns the boundary danger. */
  error?: string
  /** Sets aria-required and shows a visual `*` that is hidden from screen readers. */
  required?: boolean
  /** Password field with a 44pt Show/Hide toggle. */
  secureToggle?: boolean
  /** Controlled visibility for a secureToggle field (e.g. two fields revealed together). */
  revealed?: boolean
  onRevealChange?: (revealed: boolean) => void
  /** Multi-line body (feedback, bug report). */
  multiline?: boolean
  testID?: string
}

/**
 * The app's labelled text input. The boundary is drawn in `inputBorder`
 * (≥3:1 on every surface, WCAG 1.4.11) and turns the focus colour while
 * focused, so the field always shows where typing will land. A placeholder is
 * only an example, never the label.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label, hint, error, required, secureToggle, revealed, onRevealChange, multiline, testID,
    onFocus, onBlur, secureTextEntry, ...inputProps
  },
  ref,
) {
  const { theme: t } = useTheme()
  const [focused, setFocused] = useState(false)
  const [ownReveal, setOwnReveal] = useState(false)
  const shown = revealed ?? ownReveal
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const hintId = `field-hint-${base}`
  const errorId = `field-error-${base}`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const borderColor = error ? t.dangerBorder : focused ? t.focusRing : t.inputBorder

  const toggleReveal = () => {
    const next = !shown
    if (revealed === undefined) setOwnReveal(next)
    onRevealChange?.(next)
  }

  // aria-* on TextInput: react-native-web forwards them to the <input>; RN 0.81
  // reads aria-required / aria-invalid natively. Typed loosely: RN's TextInput
  // types omit some of the web-only ones.
  const ariaProps = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required ? true : undefined,
  } as Record<string, unknown>

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={textStyle('label', t.textPrimary)} maxFontSizeMultiplier={2}>
        {label}
        {required ? <Text {...decorative} style={{ color: t.accentText }}> *</Text> : null}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 120 : 48,
          borderWidth: focused || error ? 2 : 1,
          // Keep the text from shifting when the border thickens.
          paddingHorizontal: focused || error ? spacing.md - 1 : spacing.md,
          borderColor,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: t.surface,
        }}
      >
        <TextInput
          ref={ref}
          testID={testID}
          accessibilityLabel={label}
          placeholderTextColor={t.textTertiary}
          secureTextEntry={secureToggle ? !shown : secureTextEntry}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : undefined}
          maxFontSizeMultiplier={2}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          {...inputProps}
          {...ariaProps}
          style={[
            textStyle('body', t.textPrimary),
            { flex: 1, minHeight: 44, paddingVertical: spacing.sm },
            multiline ? { minHeight: 104, paddingTop: spacing.md } : null,
            // The frame draws the focus state; drop the browser's own outline.
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {secureToggle ? (
          <Pressable
            onPress={toggleReveal}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            style={(state) => {
              const { pressed, hovered, focused: kbd } = state as WebPressableState
              return [
                {
                  minWidth: 44, minHeight: 44, marginRight: -spacing.xs,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                  paddingHorizontal: spacing.sm, borderRadius: radius.sm,
                  backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                },
                focusRing(t.focusRing, kbd),
              ]
            }}
          >
            <View {...decorative}>
              <Lineicons icon={shown ? EyeSolid : EyeOutlined} size={18} color={t.textSecondary} />
            </View>
            <Text style={[textStyle('label', t.textSecondary), { fontFamily: fonts.bodyMedium }]} maxFontSizeMultiplier={1.6}>
              {shown ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          nativeID={errorId}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={textStyle('bodySm', t.danger)}
          maxFontSizeMultiplier={2}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text nativeID={hintId} style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
})
