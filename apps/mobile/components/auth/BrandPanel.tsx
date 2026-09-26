// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image, Text, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Pencil1Outlined, GraduationCap1Outlined, CalendarDaysOutlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative } from '../ui/a11y'

export const TAGLINE = 'Para sa mga Iskolar ng Bayan'

type Icon = typeof Pencil1Outlined

// Three honest jobs the app does: no invented numbers, no retired AI claims.
export const VALUE: { icon: Icon; title: string; body: string }[] = [
  { icon: Pencil1Outlined, title: 'Practice for the exam', body: 'Mock exams, flashcards and a quick daily sprint, even offline.' },
  { icon: GraduationCap1Outlined, title: 'Find schools and scholarships', body: 'Deadlines, requirements and the ones you can apply for.' },
  { icon: CalendarDaysOutlined, title: 'Know what to do today', body: 'A study plan paced to your exam date, one step at a time.' },
]

export const PROMISE = 'Free practice for UPCAT and other college entrance exams.'

/**
 * The maroon brand half of the wide-window entry frame (sign-in, landing):
 * the promise, the three jobs, and the approved tagline. No headings of its
 * own, so the page keeps its one h1 in the task column. White on maroon
 * measures 10.95:1; the secondary lines use white at 85% (≈ 8:1).
 */
export function BrandPanel() {
  const { theme: t } = useTheme()
  const soft = { opacity: 0.85 }
  return (
    <View
      testID="brand-panel"
      style={{
        flex: 1, backgroundColor: t.accent, borderRadius: radius.xxl, borderCurve: 'continuous',
        padding: spacing.xxxl + spacing.lg, justifyContent: 'space-between', gap: spacing.xxxl, overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: 40, height: 40, borderRadius: radius.md }}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Text style={textStyle('headline', t.textInverse)} maxFontSizeMultiplier={1.4}>Iskotify</Text>
      </View>

      <View style={{ gap: spacing.xxxl, maxWidth: 520 }}>
        <Text style={textStyle('display', t.textInverse)} maxFontSizeMultiplier={1.3}>{PROMISE}</Text>
        <View style={{ gap: spacing.xl }}>
          {VALUE.map(v => (
            <View key={v.title} style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
              <View
                {...decorative}
                style={{
                  width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous',
                  borderWidth: 1, borderColor: t.textInverse, opacity: 0.9,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Lineicons icon={v.icon} size={20} color={t.textInverse} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={textStyle('titleSm', t.textInverse)} maxFontSizeMultiplier={1.6}>{v.title}</Text>
                <Text style={[textStyle('bodySm', t.textInverse), soft]} maxFontSizeMultiplier={1.6}>{v.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Text style={[textStyle('label', t.textInverse), soft]} maxFontSizeMultiplier={1.4}>{TAGLINE}</Text>
    </View>
  )
}
