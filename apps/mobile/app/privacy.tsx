import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'

// Policy text is kept word for word from the May 2026 version; only the layout
// changed. (Two lines mention features that no longer exist — the AI Coach and
// an Export Data setting — and are flagged for the owner to revise; legal copy
// is not rewritten in a design pass.)
const SECTIONS = [
  {
    title: 'Information We Collect',
    body: 'Iskotify stores your practice answers, flashcard progress, and app preferences locally on your device. If you sign in with Google, we sync this data to your account so you can restore it across devices. We do not sell or share your personal data with third parties.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used solely to power the app features — tracking your progress, identifying weak areas, scheduling reminders, and personalizing the AI Coach. Analytics (if any) are anonymized and used only to improve the app.',
  },
  {
    title: 'Data Storage',
    body: 'All study data is stored locally on your device using an encrypted SQLite database. If cloud sync is enabled, data is stored securely in Supabase (hosted on AWS) with row-level security — only you can access your own data.',
  },
  {
    title: 'Notifications',
    body: 'Iskotify may send you local push notifications for daily practice reminders and exam countdowns. These are scheduled on-device and never sent through a third-party server. You can disable notifications at any time from the home screen or your device settings.',
  },
  {
    title: 'Third-Party Services',
    body: 'Iskotify uses Google Sign-In (OAuth 2.0) for optional account authentication. If you choose to sign in, Google\'s privacy policy also applies. We use Supabase for backend storage, and Expo for app delivery.',
  },
  {
    title: 'Children\'s Privacy',
    body: 'Iskotify is designed for students aged 15 and above preparing for college entrance exams. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently done so, please contact us.',
  },
  {
    title: 'Your Rights',
    body: 'You can delete your data at any time by uninstalling the app (removes local data) or by contacting us to delete your cloud account data. You can also use the Export Data feature in Settings to download a copy of your data.',
  },
  {
    title: 'Changes to This Policy',
    body: 'We may update this privacy policy from time to time. We will notify you of significant changes through an in-app notice. Continued use of the app after changes constitutes acceptance of the updated policy.',
  },
]

export default function PrivacyScreen() {
  return (
    <InfoPage title="Privacy and terms" lead="Effective May 2026">
      {SECTIONS.map(sec => (
        <InfoSection key={sec.title} title={sec.title}>
          <Prose>{sec.body}</Prose>
        </InfoSection>
      ))}
      <InfoSection title="Questions?">
        <Prose>For privacy-related requests or concerns, email us.</Prose>
        <Prose selectable>teamocsph@gmail.com</Prose>
      </InfoSection>
    </InfoPage>
  )
}
