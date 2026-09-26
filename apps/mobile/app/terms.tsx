import { View, Text } from 'react-native'
import { router } from 'expo-router'
import {
  TERMS_LAST_UPDATED,
  TERMS_PRIVACY_LINK,
  TERMS_SECTIONS,
  TERMS_SUMMARY,
  type TermsBlock,
} from '@iskotify/utils/terms-of-service'
import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'
import { useTheme } from '../theme/ThemeContext'
import { fonts, spacing } from '../theme/tokens'

// The terms text lives in packages/utils/src/termsOfService.ts, shared with the
// public web page (apps/admin/app/terms/page.tsx), so the two always match.
// This screen only lays it out, like app/privacy.tsx. Every paragraph is
// selectable so a student can copy the contact address; "Privacy Policy" in
// the text opens the in-app policy.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PRIVACY_PATTERN = new RegExp(`(${escape(TERMS_PRIVACY_LINK.text)})`)

/** Text with "Privacy Policy" turned into an in-app link. */
function Linked({ text }: { text: string }) {
  const { theme: t } = useTheme()
  if (!text.includes(TERMS_PRIVACY_LINK.text)) return <>{text}</>
  return (
    <>
      {text.split(PRIVACY_PATTERN).map((part, i) =>
        part === TERMS_PRIVACY_LINK.text ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => router.push(TERMS_PRIVACY_LINK.href)}
            style={{ color: t.accentText, textDecorationLine: 'underline' }}
          >
            {part}
          </Text>
        ) : part,
      )}
    </>
  )
}

function Bullets({ items }: { items: { label?: string; text: string }[] }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.sm, paddingLeft: spacing.md }}>
      {items.map(item => (
        <Prose key={item.label ?? item.text} selectable>
          {item.label ? (
            <Text style={{ fontFamily: fonts.bodySemi, color: t.textPrimary }}>{`${item.label} `}</Text>
          ) : null}
          <Linked text={item.text} />
        </Prose>
      ))}
    </View>
  )
}

function Block({ block }: { block: TermsBlock }) {
  return typeof block === 'string'
    ? <Prose selectable><Linked text={block} /></Prose>
    : <Bullets items={block.items} />
}

export default function TermsScreen() {
  return (
    <InfoPage title="Terms of service" lead={`Last updated: ${TERMS_LAST_UPDATED}`}>
      <InfoSection title="The short version">
        <Bullets items={TERMS_SUMMARY.map(text => ({ text }))} />
      </InfoSection>
      {TERMS_SECTIONS.map(sec => (
        <InfoSection key={sec.title} title={sec.title}>
          {sec.blocks.map((block, i) => <Block key={i} block={block} />)}
        </InfoSection>
      ))}
    </InfoPage>
  )
}
