import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'
import { Disclosure } from '../components/explore/Disclosure'
import { Button } from '../components/ui/Button'
import { decorative, heading } from '../components/ui/a11y'
import { TAB_DESTINATIONS } from '../components/navigation/destinations'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'

type QA = { q: string; a: string }

// Answers follow the current app: Today · Practice · Explore · Progress, with
// Profile behind the avatar. No retired features (AI coach, data export), no
// promises about admission (see the Estimated Admission Score answer).
const SECTIONS: { title: string; items: QA[] }[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What should I do first each day?',
        a: 'Open Today and do the next step it shows. It is picked from your exam date, your focus and what you have practiced so far, so one step a day keeps you on pace.',
      },
      {
        q: 'How do I choose my focus exam?',
        a: 'Open Explore, find the entrance exam or scholarship, and tap Add to Focus. You can follow more than one. Your focus shows on Today with its countdown.',
      },
      {
        q: 'Why aren\'t notifications showing up?',
        a: 'Make sure notifications are allowed for Iskotify in your phone\'s settings, then turn on Push notifications in Iskotify\'s Settings.',
      },
    ],
  },
  {
    title: 'Practice and mock exams',
    items: [
      {
        q: 'Where do I practice?',
        a: 'Practice has mock exams, subject drills and the flashcards due today. Today also suggests the one next thing to do.',
      },
      {
        q: 'What happens if I leave a mock exam halfway?',
        a: 'Your answers are saved on this device as you go. Open the same mock exam again and tap Resume where you left off.',
      },
      {
        q: 'What is the Estimated Admission Score?',
        a: 'An estimate based on historical cutoffs, your grades and your real practice answers. It is only an estimate and cannot tell you whether you will get in. The more questions you answer per subject, the steadier it gets.',
      },
    ],
  },
  {
    title: 'Offline use',
    items: [
      {
        q: 'Can I use Iskotify offline?',
        a: 'Yes. Practice questions, flashcards and your progress are stored on your phone, so you can study without internet. Connect now and then to get new questions and updates.',
      },
      {
        q: 'Does the web version work offline?',
        a: 'The web version needs an internet connection to open. Once it is open, your answers are saved in this browser as you go.',
      },
    ],
  },
  {
    title: 'Account and sync',
    items: [
      {
        q: 'How do I back up my progress?',
        a: 'Open your Profile from the avatar and sign in with Google. Your progress is saved to your account, and you can restore it on another phone.',
      },
      {
        q: 'I changed phones. Will my progress come back?',
        a: 'Yes, if you signed in before. Sign in with the same account and Iskotify brings back your profile, your focus and your progress.',
      },
    ],
  },
]

/** The first thing on the page: replay the guided tour. */
function TourEntry() {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.accentSurface, borderRadius: radius.xl, borderCurve: 'continuous',
        padding: spacing.xl, gap: spacing.lg, marginBottom: spacing.xxxl,
      }}
    >
      <View {...decorative} style={{ flexDirection: 'row', gap: spacing.sm }}>
        {TAB_DESTINATIONS.map((d, i) => (
          <View
            key={d.name}
            style={{
              width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous',
              backgroundColor: i === 0 ? t.accent : t.surface, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Lineicons icon={d.icon} size={20} color={i === 0 ? t.textInverse : t.accentText} />
          </View>
        ))}
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text {...heading(2)} style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.6}>
          New here? See how it works
        </Text>
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
          A one-minute tour of Today, Practice, Explore and Progress.
        </Text>
      </View>
      <Button label="Take the tour" onPress={() => router.push('/tour?from=help')} size="lg" />
    </View>
  )
}

export default function HelpScreen() {
  return (
    <InfoPage title="Help and support" lead="Answers to what students ask most, grouped by what you are trying to do.">
      <TourEntry />

      {SECTIONS.map(section => (
        <InfoSection key={section.title} title={section.title}>
          <View>
            {section.items.map(item => (
              <Disclosure key={item.q} title={item.q}>
                <Prose>{item.a}</Prose>
              </Disclosure>
            ))}
          </View>
        </InfoSection>
      ))}

      <InfoSection title="Still need help?">
        <Prose>Email us and we&apos;ll get back to you as soon as we can. You can also send a bug report from Settings.</Prose>
        <Prose selectable>teamocsph@gmail.com</Prose>
      </InfoSection>
    </InfoPage>
  )
}
