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

export const PRIVACY_LAST_UPDATED = 'October 1, 2026'
export const PRIVACY_CONTACT_EMAIL = 'teamocsph@gmail.com'
export const NPC_WEBSITE = 'privacy.gov.ph'

// Details the owner fills in before launch. Leave a value '' until it is real:
// an empty detail is left out of the policy, never shown as a placeholder (a
// test fails if any [bracketed] text renders). termsOfService.ts repeats
// BUSINESS_ADDRESS (it imports nothing); a test keeps the two equal.
export const DPO_NAME = ''
/** Set only once the inbox works; until then the DPO is reached at PRIVACY_CONTACT_EMAIL. */
export const DPO_EMAIL = ''
export const BUSINESS_ADDRESS = ''
export const SUPABASE_REGION = ''
export const UPSTASH_REGION = ''

/** " Servers: <region>." once the region is known, otherwise nothing. */
const servers = (region: string) => (region ? ` Servers: ${region}.` : '')

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
      'Iskotify is a study app for Filipino students getting ready for college entrance exams and scholarships. In this policy, “we” and “us” means Online Creative Solutions, who runs the Iskotify app and website.',
      'Online Creative Solutions is responsible for your personal data in Iskotify. Under the Data Privacy Act, that makes us the “personal information controller”.',
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
            text: 'Your family’s income bracket, your GWA, your province, your Grade 8 to 11 grades, your school type, your target campus, and whether you belong to an Indigenous community. We collect your grades, GWA, income bracket and Indigenous community only if you turn on sharing them, which is off until you choose. You can leave all of these blank.',
          },
          {
            label: 'Your study activity.',
            text: 'Your answers and scores, practice sessions, flashcard review schedule, saved decks, focus list, study plan, the scholarship requirements you tick off, your notes and note reminders, and your app settings, like your reminder time and focus mode.',
          },
          {
            label: 'Things you send us.',
            text: 'Bug reports (what you wrote, which part of the app, whether you’re on Android, iOS or the web, the app version, and a screenshot if you attach one), app feedback and star ratings, reports about a question (the question and your reason), and suggested date corrections (the date, your note and your source link). If you’re signed in, these are linked to your account.',
          },
          {
            label: 'Search words.',
            text: 'When you look for your school and it isn’t on our list, the school name you typed. Scholarship searches are ranked on your phone by keywords, so the words you type there stay on your phone and are never sent to an AI provider.',
          },
          {
            label: 'Usage analytics.',
            text: 'When analytics is switched on, we record when you open the app, which screens you visit, and a few actions, like finishing a practice session or adding an exam to your focus list. On the web, clicks are recorded too. If you’re signed in, this is linked to your account ID only, never your email address or name. Our analytics service also collects basic device details, like your device type and a rough location based on your IP address.',
          },
          {
            label: 'Early access sign-ups.',
            text: 'If you sign up for early access on our website, your name, email address, school and grade level.',
          },
          {
            label: 'Purchases.',
            text: 'If you buy Iskotify Full Access: whether your account has it, and a record of the purchase (where you bought it, the amount, the date and the payment reference). Your card or wallet details go to the payment service, not to us.',
          },
        ],
      },
      'Some of this, like your grades and whether you belong to an Indigenous community, counts as sensitive personal information under the Data Privacy Act. We use it only for the features it powers.',
      'When you sign up, we ask whether you’re 18 or older or under 18. We don’t ask for your birthday, phone number, home address or any ID, and Iskotify doesn’t use your phone’s GPS.',
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
    title: 'Our legal basis',
    blocks: [
      'The Data Privacy Act only lets us use your data for a reason it allows (Section 12, and Section 13 for sensitive personal information). Here is our reason for each use:',
      {
        items: [
          { label: 'Running the app and backing up your data:', text: 'needed to provide the service you signed up for (Section 12(b)).' },
          { label: 'Your grades, GWA, income bracket, Indigenous community and school records:', text: 'only with your separate consent, which you give by turning on sharing them (Section 13(a)). It’s off until you choose, and you can withdraw it at any time.' },
          { label: 'Usage analytics:', text: 'your consent (Section 12(a)). If you’re under 18, analytics stays off unless you turn it on. If you’re 18 or older, it’s on when you finish signing up and you can turn it off at any time. Nothing is recorded before you make this choice.' },
          { label: 'Early access sign-ups:', text: 'your consent, when you fill in the form (Section 12(a)).' },
          { label: 'Purchases and their records:', text: 'needed to give you what you bought (Section 12(b)), and keeping purchase records is a legal obligation under tax law (Section 12(c)).' },
          { label: 'Bug reports, feedback, question reports, date suggestions, and stopping spam and abuse:', text: 'our legitimate interest in keeping Iskotify working, accurate and safe (Section 12(f)). We use only what we need for this.' },
          { label: 'When the law requires it:', text: 'to meet a legal obligation, like a valid court order (Section 12(c)).' },
        ],
      },
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
      'Some of the services we use have servers outside the Philippines, so your data may be sent abroad. The next section lists each one and where it is. We choose services that protect data carefully, but no system is perfectly secure.',
      'If a breach puts your data at risk, we’ll notify the National Privacy Commission and the affected users, as the law requires.',
    ],
  },
  {
    title: 'Who we share it with',
    blocks: [
      'We don’t sell or rent your data. We share it only with the services that help run Iskotify, and each one gets only what it needs:',
      {
        items: [
          { label: 'Supabase', text: `stores our database and files, runs sign-in, and sends sign-in emails like password resets.${servers(SUPABASE_REGION)}` },
          { label: 'Vercel', text: 'hosts the Iskotify website and web app, and runs the small server that passes school-name lookups to Google Places. Servers: United States.' },
          { label: 'Google', text: 'handles Google sign-in if you choose it. Google Places looks up a school name you type that isn’t on our list. Servers: United States.' },
          { label: 'Have I Been Pwned', text: 'helps check whether a new password has shown up in a known data leak. When you create or reset a password, the app scrambles it on your device into a code (a SHA-1 hash) and sends only the first 5 characters of that code to the Pwned Passwords service (api.pwnedpasswords.com). Your password and the full code never leave your device, so this service gets nothing that identifies you.' },
          { label: 'PostHog', text: 'runs our usage analytics, when analytics is switched on. Servers: United States.' },
          { label: 'Expo', text: 'delivers app updates to your phone. Servers: United States.' },
          { label: 'Resend', text: 'sends early access emails, so it gets your name and email address. Servers: United States.' },
          { label: 'Upstash', text: `briefly keeps your IP address to stop spam on some forms and searches. It’s deleted automatically within about an hour.${servers(UPSTASH_REGION)}` },
          { label: 'RevenueCat', text: 'manages Iskotify Full Access bought in the Android app. It receives your Iskotify account ID and your Google Play purchase details. Servers: United States.' },
          { label: 'PayMongo', text: 'processes web payments for Iskotify Full Access. It receives the payment details you enter on its page. Servers: Philippines.' },
          { label: 'Google Play', text: 'handles in-app payments in the Android app, under Google’s privacy policy.' },
        ],
      },
      'We use service agreements requiring these providers to protect your data.',
      'Some practice questions, answer choices and explanations are drafted with the help of AI tools by our team and checked before they reach the app. Nothing you type or do in the app is sent to those tools. If an explanation looks wrong or inappropriate, use Report on the question.',
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
          { label: 'Your account and backup:', text: 'until you delete your account (in the app, or by emailing us).' },
          { label: 'Bug reports and their screenshots:', text: '12 months after we close the report, then deleted.' },
          { label: 'Feedback, question reports and date suggestions:', text: '12 months after you send them, then deleted.' },
          { label: 'Analytics:', text: '12 months in PostHog, then deleted automatically. We can delete what’s linked to you sooner if you ask.' },
          { label: 'Early access sign-ups:', text: 'until 6 months after Iskotify launches publicly, or sooner if you ask us to remove them.' },
          { label: 'Purchase records:', text: 'kept for as long as tax law requires. When you delete your account, they’re unlinked from you.' },
          { label: 'When you delete your account:', text: 'your account, your backup, and the reports, feedback and suggestions you sent us are deleted at the same time, even if the periods above haven’t ended. Purchase records are kept, unlinked from you, as above.' },
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
          { label: 'Withdraw consent.', text: 'To stop sharing your grades, GWA, income bracket and Indigenous community, go to Profile, then Scholarship info, and tap Withdraw consent and clear these details. This also clears those details from the app and your backup. To turn analytics off, go to Settings, then Privacy. Withdrawing doesn’t affect what we did with your consent before.' },
          { label: 'Turn off reminders.', text: 'Go to Settings, then Notifications, or use your phone’s settings.' },
          { label: 'Download your data.', text: 'Go to Profile, then Your data, then Export Data. This saves a file with your settings, focus list, saved decks, progress, practice sessions, answer history, flashcard schedule, study plan, and notes with their labels. It doesn’t include the reports and feedback you sent us or your analytics; email us for a copy of those.' },
          { label: 'Clear your data from a device.', text: 'On the web, Clear data & sign out (in Profile, under Your data) removes everything Iskotify saved in that browser. On a phone, Reset App Data removes all your study data from that phone (your progress, answer history, flashcard reviews, study plan, focus list and settings) but keeps your notes; you can delete them in Notes. Uninstalling the app removes everything. Neither one deletes your account or your backup.' },
        ],
      },
      `Delete your account. Go to Profile, then Your data, then Delete account, and type DELETE to confirm. This permanently deletes your login, your backup, and the bug reports (with their screenshots), feedback, question reports and date suggestions you sent us. It can’t be undone, and we keep nothing about you afterwards except where the law requires it: records of any purchase, which tax law requires us to keep, unlinked from you. Your notes and study data on that phone stay until you clear them. Can’t open the app? Go to iskotify.ph/delete-account, or email ${PRIVACY_CONTACT_EMAIL} with the subject Delete my Iskotify account, from the email address on your account. We’ll confirm it’s you and delete everything within 7 days. Analytics we keep in PostHog isn’t removed by the button; email us and we’ll delete what’s linked to you.`,
      'Under the Data Privacy Act, you have the right to:',
      {
        items: [
          { label: 'Be informed', text: 'about how your data is collected and used. That’s what this policy is for.' },
          { label: 'Access', text: 'your data and get a copy of it.' },
          { label: 'Object', text: 'to how we use your data, including uses based on our legitimate interest.' },
          { label: 'Withdraw consent', text: 'you gave us, at any time (see above for how).' },
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
      'When you sign up, we ask whether you’re 18 or older or under 18. If you’re under 18, you confirm that a parent or guardian has agreed to you using Iskotify, and to this policy and our terms. Please read this policy with them.',
      'If you’re under 18, we collect your grades, GWA, income bracket and Indigenous community only if you turn on sharing them, and analytics stays off unless you turn it on. Talk to your parent or guardian before you turn either on.',
      'Parents and guardians can email us to see, correct or delete their child’s data. Iskotify isn’t for children under 13. If we learn we have data from a child under 13, we’ll delete it.',
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
      'You can also write to our Data Protection Officer:',
      {
        items: [
          ...(DPO_NAME ? [{ label: 'Data Protection Officer:', text: DPO_NAME }] : []),
          { label: 'Email:', text: DPO_EMAIL ? `${DPO_EMAIL} or ${PRIVACY_CONTACT_EMAIL}` : PRIVACY_CONTACT_EMAIL },
          { label: 'Address:', text: BUSINESS_ADDRESS ? `Online Creative Solutions, ${BUSINESS_ADDRESS}` : 'Online Creative Solutions, Philippines' },
        ],
      },
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
