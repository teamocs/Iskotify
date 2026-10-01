import { View, Text, Pressable } from 'react-native'
import { router, type Href } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Locked1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { decorative, focusRing, heading, type WebPressableState } from '../ui/a11y'
import { FREE_DAILY_PRACTICE_QUESTIONS } from '../../utils/premiumLimits'

// Iskotify Full Access (P3) prompts. Render these only when usePremium().enabled
// (the callers' gates already guarantee it): with the flag off no upgrade UI exists.

export const PRACTICE_CAP_BODY =
  `You've done your ${FREE_DAILY_PRACTICE_QUESTIONS} free questions today. Come back tomorrow, or unlock unlimited practice.`

export const FULL_MOCK_CAP_BODY =
  "You've used your free full mock for this exam. Study Sprint stays free, or unlock unlimited full mocks."

const upgradeHref = (source: string) => `/upgrade?from=${encodeURIComponent(source)}` as Href

interface Props {
  title: string
  body: string
  /** Where the prompt was shown (analytics + return context), e.g. 'practice_cap'. */
  source: string
  testID?: string
}

/** A calm card that says why the run stopped and links to /upgrade. One primary action. */
export function UpgradeCard({ title, body, source, testID }: Props) {
  const { theme: t } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accentBorder,
        borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View {...decorative}>
          <Lineicons icon={Locked1Outlined} size={20} color={t.accentText} />
        </View>
        <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={2}>
          {title}
        </Text>
      </View>
      <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>{body}</Text>
      <Button label="Unlock Full Access" fullWidth onPress={() => router.push(upgradeHref(source))} />
    </View>
  )
}

/** Stands in for the per-option "why the others are wrong" rows; the main explanation stays visible. */
export function LockedOptionExplanations() {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm,
        backgroundColor: t.surfaceSubtle, borderRadius: radius.md, borderCurve: 'continuous',
        paddingHorizontal: spacing.md, marginTop: spacing.sm,
      }}
    >
      <View {...decorative}>
        <Lineicons icon={Locked1Outlined} size={16} color={t.textSecondary} />
      </View>
      <Text style={[textStyle('bodySm', t.textSecondary), { flexShrink: 1, paddingVertical: spacing.sm }]} maxFontSizeMultiplier={2}>
        See why each wrong choice is wrong with Full Access.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Unlock Full Access to see why each wrong choice is wrong"
        onPress={() => router.push(upgradeHref('option_explanations'))}
        hitSlop={4}
        style={(s) => [
          { minHeight: 44, justifyContent: 'center' },
          focusRing(t.focusRing, (s as WebPressableState).focused),
        ]}
      >
        <Text style={[textStyle('label', t.accentText), { textDecorationLine: 'underline' }]} maxFontSizeMultiplier={2}>
          Unlock
        </Text>
      </Pressable>
    </View>
  )
}
