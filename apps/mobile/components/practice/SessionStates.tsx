import { View, Text } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { FileQuestionOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Screen } from '../ui/Screen'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ProgressBar } from '../ui/ProgressBar'
import { EmptyState } from '../ui/EmptyState'
import { PageTitle } from '../ui/PageTitle'
import { DetailTopBar, goBackOr } from '../explore/DetailTopBar'

/**
 * The three "not a session yet" states every practice launcher shares, on
 * the same page frame (back button, 720 reading column) so a phone and a
 * desktop browser both get a composed page instead of a lone line of text.
 */

interface FrameProps { fallbackHref: string; children: React.ReactNode }

function Frame({ fallbackHref, children }: FrameProps) {
  return (
    <Screen header={<DetailTopBar bare fallbackHref={fallbackHref} />} width="reading">
      {children}
    </Screen>
  )
}

/** Skeleton of a chooser: title, lead, a hero card and two rows. Announced once. */
export function SessionLoading({ label, fallbackHref = '/practice' }: { label: string; fallbackHref?: string }) {
  return (
    <Frame fallbackHref={fallbackHref}>
      <View accessible accessibilityLabel={label} aria-busy style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <Skeleton width="60%" height={30} />
        <Skeleton width="40%" height={18} />
        <View style={{ height: spacing.md }} />
        <Skeleton height={160} radius={radius.xl} />
        <Skeleton height={64} radius={radius.lg} />
        <Skeleton height={64} radius={radius.lg} />
      </View>
    </Frame>
  )
}

/**
 * First-time preparation of multiple-choice options (on-device AI). Shows
 * real progress, and says why it only happens once.
 */
export function SessionPreparing({ done, total, fallbackHref = '/practice' }: { done: number; total: number; fallbackHref?: string }) {
  const { theme: t } = useTheme()
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <Frame fallbackHref={fallbackHref}>
      <PageTitle title="Preparing quiz options" lead="This runs only the first time you practise each card." />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
          <Text style={textStyle('label', t.textPrimary)} maxFontSizeMultiplier={2}>{`${done} of ${total} cards`}</Text>
          <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={2}>{`${pct}%`}</Text>
        </View>
        <ProgressBar value={total > 0 ? done / total : 0} label="Preparing quiz options" />
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          The on-device AI writes the answer choices, so it works offline once it is done.
        </Text>
      </Card>
    </Frame>
  )
}

interface EmptyProps {
  title: string
  body: string
  fallbackHref?: string
  icon?: React.ReactNode
  actionLabel?: string
}

/** Nothing to practise here: say why, and offer one way back. */
export function SessionEmpty({ title, body, fallbackHref = '/practice', icon, actionLabel = 'Back to Practice' }: EmptyProps) {
  const { theme: t } = useTheme()
  return (
    <Frame fallbackHref={fallbackHref}>
      <EmptyState
        icon={icon ?? <Lineicons icon={FileQuestionOutlined} size={24} color={t.textSecondary} />}
        title={title}
        body={body}
        actionLabel={actionLabel}
        onAction={() => goBackOr(fallbackHref)}
      />
    </Frame>
  )
}
