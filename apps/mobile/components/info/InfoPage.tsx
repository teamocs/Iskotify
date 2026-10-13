import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { DetailTopBar } from '../explore/DetailTopBar'
import { heading } from '../ui/a11y'

interface PageProps {
  title: string
  /** One orienting sentence under the title. */
  lead?: string
  /** Where Back goes after a deep link / web refresh (no history). */
  fallbackHref?: string
  /** Extra content above the title (e.g. the About page's brand mark). */
  above?: React.ReactNode
  children: React.ReactNode
}

/**
 * Read-mode page (Help, About, Privacy, the Settings sub-pages): a named back
 * button, the title as the page's only level-1 heading, and the body in the
 * 720 reading column so lines stay a comfortable length on desktop.
 */
export function InfoPage({ title, lead, fallbackHref = '/settings', above, children }: PageProps) {
  const { theme: t } = useTheme()
  const page = (
    <Screen header={<DetailTopBar bare fallbackHref={fallbackHref} />} width="reading">
      <View style={{ gap: spacing.sm, paddingTop: spacing.sm, marginBottom: spacing.xxl }}>
        {above}
        <Text role="title1" {...heading(1)} maxFontSizeMultiplier={1.6}>{title}</Text>
        {lead ? (
          <Text role="body" color={t.textSecondary}>{lead}</Text>
        ) : null}
      </View>
      {children}
    </Screen>
  )
  // Forms (feedback, bug report) sit in these pages. Android's adjustResize
  // already lifts the window; iOS needs the padding.
  return Platform.OS === 'ios'
    ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{page}</KeyboardAvoidingView>
    : page
}

/** A titled prose section: level-2 heading, then paragraphs. */
export function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
      <Text role="title3" {...heading(2)} maxFontSizeMultiplier={1.6}>{title}</Text>
      {children}
    </View>
  )
}

/** Body paragraph at reading size (body, 17/22), secondary ink. */
export function Prose({ children, selectable }: { children: React.ReactNode; selectable?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <Text role="body" color={t.textSecondary} selectable={selectable}>
      {children}
    </Text>
  )
}
