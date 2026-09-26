// Iskotify privacy policy: the ONE source of truth for its text.
//
// Rendered by the in-app page (apps/mobile/app/privacy.tsx) and the public web
// page (apps/admin/app/privacy/page.tsx). Plain data, no React and no imports, so
// both apps can load it through the "@iskotify/utils/privacy-policy" subpath
// without pulling in the rest of the package (the Supabase clients).
//
// Every factual claim here was checked against the code on the date below. When
// the app changes what it collects, stores or shares, change this file and the
// date together. packages/utils/src/__tests__/privacyPolicy.test.ts guards the
// structure and the claims that must (or must never) appear.

export const PRIVACY_LAST_UPDATED = 'September 26, 2026'
export const PRIVACY_CONTACT_EMAIL = 'teamocsph@gmail.com'
export const NPC_WEBSITE = 'privacy.gov.ph'

/** One bullet in a list. `label` is shown in bold before the text. */
export interface PrivacyListItem {
  label?: string
  text: string
}

/** A paragraph (string) or a bulleted list. */
export type PrivacyBlock = string | { items: PrivacyListItem[] }

export interface PrivacySection {
  title: string
  blocks: PrivacyBlock[]
}

/** "The short version": a few lines above the full policy. */
export const PRIVACY_SUMMARY: string[] = [
  'Your study data lives on your device. When you sign in, we back it up to your account so you can get it back on another device.',
  'We don’t sell your data, and there are no ads in Iskotify.',
  'A few outside services help run Iskotify, such as our database, sign-in and hosting. Each one gets only what it needs.',
  `You can ask to see, correct, download or delete your data. Just email ${PRIVACY_CONTACT_EMAIL}.`,
  'The Data Privacy Act of 2012 protects you. If you think we’ve mishandled your data, you can complain to the National Privacy Commission.',
]

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Who we are',
    blocks: [
      'Iskotify is a study app for Filipino students getting ready for college entrance exams and scholarships. In this policy, “we” and “us” means the Iskotify team, who runs the app and the Iskotify website.',
      'This policy covers the Iskotify app, on your phone or on the web, and the Iskotify website. It follows the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).',
    ],
  },
  {
    title: 'What we collect',
    blocks: [
      'We only collect what Iskotify needs to work. Here is the full list.',
      {
        items: [
          {
            label: 'Your account.',
            text: 'Your email address and password if you sign up with email, or your Google account’s email, name and profile picture if you sign in with Google. Your password is stored scrambled (hashed), so no one on our team can read it.',
          },
          {
            label: 'Your profile.',
            text: 'Your name, school, grade level, target exams and target courses, and the region your school is in. You give us these when you set up the app.',
          },
          {
            label: 'Scholarship and score details (optional).',
            text: 'Your family’s income bracket, your GWA, your province, your Grade 8 to 11 grades, your school type, your target campus, and whether you belong to an Indigenous community. You can leave these blank.',
          },
          {
            label: 'Your study activity.',
            text: 'Your answers and scores, practice sessions, flashcard review schedule, saved decks, focus list, study plan, the scholarship requirements you tick off, your notes and note reminders, and your app settings, like theme and reminder time.',
          },
          {
            label: 'Things you send us.',
            text: 'Bug reports (what you wrote, which part of the app, whether you’re on Android, iOS or the web, the app version, and a screenshot if you attach one), app feedback and star ratings, reports about a question (the question and your reason), and suggested date corrections (the date, your note and your source link). If you’re signed in, these are linked to your account.',
          },
          {
            label: 'Search words.',
            text: 'When you press search on the Scholarships tab, the words you typed. When you look for your school and it isn’t on our list, the school name you typed.',
          },
          {
            label: 'Usage analytics.',
            text: 'When analytics is switched on, we record when you open the app, which screens you visit, and a few actions, like finishing a practice session or adding an exam to your focus list. On the web, clicks are recorded too. If you’re signed in, this is linked to your account ID only, never your email address or name. Our analytics service also collects basic device details, like your device type and a rough location based on your IP address.',
          },
          {
            label: 'Early access sign-ups.',
            text: 'If you sign up for early access on our website, your name, email address, school and grade level.',
          },
        ],
      },
      'Some of this, like your grades and whether you belong to an Indigenous community, counts as sensitive personal information under the Data Privacy Act. We use it only for the features it powers.',
      'We don’t ask for your birthday, phone number, home address or any ID, and Iskotify doesn’t use your phone’s GPS.',
    ],
  },
  {
    title: 'Why we use it',
    blocks: [
      {
        items: [
          { text: 'To run the app: track your progress, plan your study and remind you to practice.' },
          { text: 'To back up your data when you sign in, so you can restore it on another device.' },
          { text: 'To match you with scholarships and to work out your Estimated Admission Score. The score is calculated on your device.' },
          { text: 'To fix bugs, check the questions and dates you report, and read your feedback.' },
          { text: 'To show better search results.' },
          { text: 'To see which features students use, so we know what to improve (only when analytics is on).' },
          { text: 'To email you the early access download link, if you signed up for it.' },
        ],
      },
      'We don’t sell your data, and we don’t use it for ads.',
    ],
  },
  {
    title: 'Where it’s stored',
    blocks: [
      {
        items: [
          {
            label: 'On your device.',
            text: 'Your study data is saved in the app on your phone, or in your browser’s storage on the web. Iskotify doesn’t add its own encryption to it, so a screen lock helps keep it private. The app keeps only your latest 5,000 answers.',
          },
          {
            label: 'In your backup.',
            text: 'When you’re signed in, a copy of your profile, settings, study activity and notes is saved to your account on Supabase, our database provider. Only your account can read it through the app. A few people on our team can reach the database to keep it running.',
          },
          {
            label: 'Things you send us.',
            text: 'These are saved in the same database. A screenshot you attach to a bug report is kept in private storage, and only our team can view it.',
          },
        ],
      },
      'Some of the services we use have servers outside the Philippines. Our analytics service, for example, is in the United States. We choose services that protect data carefully, but no system is perfectly secure.',
    ],
  },
  {
    title: 'Who we share it with',
    blocks: [
      'We don’t sell or rent your data. We share it only with the services that help run Iskotify, and each one gets only what it needs:',
      {
        items: [
          { label: 'Supabase', text: 'stores our database and files, runs sign-in, and sends sign-in emails like password resets.' },
          { label: 'Vercel', text: 'hosts the Iskotify website and web app, and runs the small server that passes your searches along.' },
          { label: 'Google', text: 'handles Google sign-in if you choose it. Google’s Gemini AI ranks results for the words you type in scholarship search. Google Places looks up a school name you type that isn’t on our list.' },
          { label: 'Have I Been Pwned', text: 'helps check whether a new password has shown up in a known data leak. When you create or reset a password, the app scrambles it on your device into a code (a SHA-1 hash) and sends only the first 5 characters of that code to the Pwned Passwords service (api.pwnedpasswords.com). Your password and the full code never leave your device.' },
          { label: 'PostHog', text: 'runs our usage analytics, when analytics is switched on.' },
          { label: 'Hugging Face', text: 'hosts the optional on-device AI model. If you download it from Settings, Hugging Face sees the download request. The model then runs on your phone, and what you type into it stays there.' },
          { label: 'Expo', text: 'delivers app updates to your phone.' },
          { label: 'Resend', text: 'sends early access emails, so it gets your name and email address.' },
          { label: 'Upstash', text: 'briefly keeps your IP address to stop spam on some forms and searches. It’s deleted automatically within about an hour.' },
        ],
      },
      'Our team, including the content staff who help us check questions and dates, can see the reports, suggestions and feedback you send.',
      'We may also share data if the law requires it, for example because of a valid court order.',
    ],
  },
  {
    title: 'How long we keep it',
    blocks: [
      {
        items: [
          { label: 'On your device:', text: 'until you clear it, reset the app or uninstall it.' },
          { label: 'Your account and backup:', text: 'until you ask us to delete your account.' },
          { label: 'Bug reports, feedback, question reports and date suggestions:', text: 'we don’t delete these on a fixed schedule yet. We keep them while they help us improve Iskotify, and we’ll delete yours if you ask.' },
          { label: 'Analytics:', text: 'kept in PostHog. We can delete what’s linked to you if you ask.' },
          { label: 'Early access sign-ups:', text: 'until you ask us to remove them.' },
        ],
      },
    ],
  },
  {
    title: 'Your choices and your rights',
    blocks: [
      'Things you can do yourself in the app:',
      {
        items: [
          { label: 'Skip optional details.', text: 'Scholarship and score details are optional.' },
          { label: 'Turn off reminders.', text: 'Go to Settings, then Notifications, or use your phone’s settings.' },
          { label: 'Download your data.', text: 'Go to Profile, then Your data, then Export Data. This saves a copy of your study data as a file.' },
          { label: 'Clear your data from a device.', text: 'On the web, Clear data & sign out (in Profile, under Your data) removes everything Iskotify saved in that browser. On a phone, Reset App Data removes all your study data from that phone (your progress, answer history, flashcard reviews, study plan, focus list and settings) but keeps your notes; you can delete them in Notes. Uninstalling the app removes everything. Neither one deletes your backup.' },
        ],
      },
      `There isn’t a delete-account button yet. To delete your account and your backup, email ${PRIVACY_CONTACT_EMAIL} from the email address on your account. We’ll confirm it’s you, delete your data, and tell you when it’s done.`,
      'Under the Data Privacy Act, you have the right to:',
      {
        items: [
          { label: 'Be informed', text: 'about how your data is collected and used. That’s what this policy is for.' },
          { label: 'Access', text: 'your data and get a copy of it.' },
          { label: 'Object', text: 'to how we use your data.' },
          { label: 'Erasure or blocking:', text: 'ask us to delete your data or stop using it.' },
          { label: 'Rectification:', text: 'ask us to correct data that’s wrong.' },
          { label: 'Data portability:', text: 'get your data in a format you can take elsewhere.' },
          { label: 'Damages:', text: 'be compensated if you’re harmed because your data was wrong, or used without permission.' },
        ],
      },
      `To use any of these rights, email us. If you think we’ve mishandled your data, please tell us first so we can fix it. You can also file a complaint with the National Privacy Commission at ${NPC_WEBSITE}.`,
    ],
  },
  {
    title: 'Students under 18',
    blocks: [
      'Iskotify is made for students getting ready for college, so many of our users are in senior high school and some are under 18.',
      'We don’t ask for your age, and the app doesn’t have a separate parent or guardian consent step. If you’re under 18, please read this policy with a parent or guardian before you sign up. Talk to them before you share optional details like your family’s income.',
      'Parents and guardians can email us to see, correct or delete their child’s data. Iskotify isn’t meant for young children. If we learn we have data from a child under 13, we’ll delete it.',
    ],
  },
  {
    title: 'Changes to this policy',
    blocks: [
      'We’ll update this policy when Iskotify changes how it handles your data. We’ll post the new version here and in the app, with a new date at the top. If a change is big, we’ll point it out in the app.',
    ],
  },
  {
    title: 'Contact us',
    blocks: [
      'Questions, requests or worries about your data? Email us. Please use the email address on your Iskotify account so we can find your data.',
      PRIVACY_CONTACT_EMAIL,
    ],
  },
]

/** Every word of the policy as one string (for tests and search). */
export function privacyPolicyText(): string {
  const blockText = (b: PrivacyBlock) =>
    typeof b === 'string' ? b : b.items.map(i => (i.label ? `${i.label} ${i.text}` : i.text)).join('\n')
  return [
    ...PRIVACY_SUMMARY,
    ...PRIVACY_SECTIONS.flatMap(s => [s.title, ...s.blocks.map(blockText)]),
  ].join('\n')
}
