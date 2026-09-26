import { View, Text } from 'react-native'
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
  type PrivacyBlock,
} from '@iskotify/utils/privacy-policy'
import { InfoPage, InfoSection, Prose } from '../components/info/InfoPage'
import { useTheme } from '../theme/ThemeContext'
import { fonts, spacing } from '../theme/tokens'

// The policy text lives in packages/utils/src/privacyPolicy.ts, shared with the
// public web page (apps/admin/app/privacy/page.tsx), so the two always match.
// This screen only lays it out. Every paragraph is selectable so a student can
// copy the contact address or the NPC website.

function Bullets({ items }: { items: { label?: string; text: string }[] }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.sm, paddingLeft: spacing.md }}>
      {items.map(item => (
        <Prose key={item.label ?? item.text} selectable>
          {item.label ? (
            <Text style={{ fontFamily: fonts.bodySemi, color: t.textPrimary }}>{`${item.label} `}</Text>
          ) : null}
          {item.text}
        </Prose>
      ))}
    </View>
  )
}

function Block({ block }: { block: PrivacyBlock }) {
  return typeof block === 'string'
    ? <Prose selectable>{block}</Prose>
    : <Bullets items={block.items} />
}

export default function PrivacyScreen() {
  return (
    <InfoPage title="Privacy and terms" lead={`Privacy policy. Last updated: ${PRIVACY_LAST_UPDATED}`}>
      <InfoSection title="The short version">
        <Bullets items={PRIVACY_SUMMARY.map(text => ({ text }))} />
      </InfoSection>
      {PRIVACY_SECTIONS.map(sec => (
        <InfoSection key={sec.title} title={sec.title}>
          {sec.blocks.map((block, i) => <Block key={i} block={block} />)}
        </InfoSection>
      ))}
    </InfoPage>
  )
}
