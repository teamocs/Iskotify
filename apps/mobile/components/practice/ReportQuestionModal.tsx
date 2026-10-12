import { useState } from 'react'
import { View, Pressable, TextInput } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { iosTextStyle, radius, spacing, weight } from '../../theme/tokens'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Text } from '../ui/Text'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

const PRESET_REASONS = [
  'Wrong answer',
  'Typo or formatting issue',
  'Question is unclear',
  'Inappropriate or wrong AI-written content',
  'Other',
] as const

interface Props {
  visible: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

/**
 * The report dialog shared by all practice runners, on the P3 Sheet (bottom
 * sheet on phones, centred dialog from medium up, keyboard-aware). Submits
 * `preset` or `preset — details` when optional details are typed. State
 * resets every time the sheet is reopened.
 */
export function ReportQuestionModal({ visible, onClose, onSubmit }: Props) {
  const { theme: t } = useTheme()
  const [selected, setSelected] = useState<string | null>(null)
  const [details, setDetails] = useState('')

  // Reset prior selection/details whenever the sheet is reopened (render-phase prev-prop pattern).
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      setSelected(null)
      setDetails('')
    }
  }

  function handleSubmit() {
    if (!selected) return
    const extra = details.trim()
    onSubmit(extra ? `${selected} — ${extra}` : selected)
  }

  const footer = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Button label="Cancel" variant="secondary" onPress={onClose} />
      <Button label="Submit" disabled={!selected} onPress={handleSubmit} style={{ flexGrow: 1 }} />
    </View>
  )

  return (
    <Sheet visible={visible} title="Report this question" onClose={onClose} footer={footer}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reason" style={{ gap: spacing.xs }}>
        {PRESET_REASONS.map(reason => {
          const on = selected === reason
          return (
            <Pressable
              key={reason}
              accessibilityRole="radio"
              aria-checked={on}
              onPress={() => setSelected(reason)}
              style={(state) => {
                const { pressed, focused } = state as WebPressableState
                return [
                  {
                    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                    borderRadius: radius.button, borderCurve: 'continuous',
                    borderWidth: 2, borderColor: on ? t.accent : 'transparent',
                    backgroundColor: on ? t.accentSurface : pressed ? t.surface2 : t.surface,
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <View
                {...decorative}
                style={{
                  width: 18, height: 18, borderRadius: radius.capsule, borderWidth: 2,
                  borderColor: on ? t.accent : t.inputBorder, alignItems: 'center', justifyContent: 'center',
                }}
              >
                {on ? <View style={{ width: 8, height: 8, borderRadius: radius.capsule, backgroundColor: t.accent }} /> : null}
              </View>
              <Text role="body" style={[{ flex: 1 }, on ? weight('600') : null]} maxFontSizeMultiplier={1.6}>
                {reason}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <TextInput
        style={{
          ...iosTextStyle('body', t.textPrimary),
          minHeight: 72, marginTop: spacing.md,
          borderWidth: 1, borderColor: t.inputBorder, borderRadius: radius.field, borderCurve: 'continuous',
          backgroundColor: t.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          textAlignVertical: 'top',
        }}
        placeholder="Add details (optional)"
        placeholderTextColor={t.textTertiary}
        accessibilityLabel="Add details (optional)"
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={300}
        maxFontSizeMultiplier={1.6}
      />
    </Sheet>
  )
}
