import { View, Text } from 'react-native'
// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import Constants from 'expo-constants'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'
import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'
import { decorative } from '../components/ui/a11y'
import { TAGLINE } from '../components/auth/AuthLayout'

const version = Constants.expoConfig?.version ?? '1.0.0'

const FEATURES = [
  'Mock exams and subject drills, with an explanation for every choice',
  'Flashcards that come back when you are about to forget them',
  'An Estimated Admission Score, based on historical cutoffs',
  'Entrance exams, scholarships, schools and courses, with their deadlines',
  'Works offline on the phone you already have',
]

function Meta({ label, value }: { label: string; value: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.divider }}>
      <Text style={textStyle('body', t.textSecondary)}>{label}</Text>
      <Text style={textStyle('titleSm', t.textPrimary)}>{value}</Text>
    </View>
  )
}

export default function AboutScreen() {
  const { theme: t } = useTheme()
  return (
    <InfoPage
      title="About Iskotify"
      lead={TAGLINE}
      above={(
        <Image
          source={require('../assets/images/icon.png')}
          style={{ width: 64, height: 64, borderRadius: radius.xl, marginBottom: spacing.sm }}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      )}
    >
      <InfoSection title="What Iskotify is">
        <Prose>
          A free study companion for Filipino students preparing for UPCAT and other college entrance
          exams. It helps you practice, find the schools and scholarships worth applying to, and keep
          track of every deadline.
        </Prose>
      </InfoSection>

      <InfoSection title="What you can do">
        <View style={{ gap: spacing.sm }}>
          {FEATURES.map(f => (
            <View key={f} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <View {...decorative} style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: t.accentText, marginTop: 9 }} />
              <View style={{ flex: 1 }}><Prose>{f}</Prose></View>
            </View>
          ))}
        </View>
      </InfoSection>

      <InfoSection title="Version">
        <View>
          <Meta label="App version" value={`v${version}`} />
          <Meta label="Available on" value="Android and web" />
          <Meta label="Made by" value="Team OCSPH" />
        </View>
      </InfoSection>

      <InfoSection title="Contact">
        <Prose>For feedback, bug reports or partnership inquiries, email us.</Prose>
        <Prose selectable>teamocsph@gmail.com</Prose>
      </InfoSection>
    </InfoPage>
  )
}
