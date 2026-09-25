import { View } from 'react-native'
import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'
import { Disclosure } from '../components/explore/Disclosure'

// Answers follow the current app: Today · Practice · Explore · Progress, with
// Profile behind the avatar. No retired features (AI coach, data export).
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I choose my focus exam?',
    a: 'Open Explore, find the entrance exam or scholarship, and tap Add to Focus. You can follow more than one. Your focus shows on Today with its countdown.',
  },
  {
    q: 'Where do I practice?',
    a: 'Practice has mock exams, subject drills and the flashcards due today. Today also suggests the one next thing to do.',
  },
  {
    q: 'Can I use Iskotify offline?',
    a: 'Yes. Practice questions, flashcards and your progress are stored on your phone, so you can study without internet. Connect now and then to get new questions and updates.',
  },
  {
    q: 'How do I back up my progress?',
    a: 'Open your Profile from the avatar and sign in with Google. Your progress is saved to your account, and you can restore it on another phone.',
  },
  {
    q: 'Why aren\'t notifications showing up?',
    a: 'Make sure notifications are allowed for Iskotify in your phone\'s settings, then turn on Push notifications in Iskotify\'s Settings.',
  },
]

export default function HelpScreen() {
  return (
    <InfoPage title="Help and support" lead="Quick answers to common questions.">
      <InfoSection title="Common questions">
        <View>
          {FAQ.map(item => (
            <Disclosure key={item.q} title={item.q}>
              <Prose>{item.a}</Prose>
            </Disclosure>
          ))}
        </View>
      </InfoSection>

      <InfoSection title="Still need help?">
        <Prose>Email us and we&apos;ll get back to you as soon as we can. You can also send a bug report from Settings.</Prose>
        <Prose selectable>teamocsph@gmail.com</Prose>
      </InfoSection>
    </InfoPage>
  )
}
