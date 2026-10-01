import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { FileQuestionOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { Screen } from '../ui/Screen'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { DetailTopBar, goBackOr } from '../explore/DetailTopBar'

/**
 * The "not a session yet" states every practice launcher shares, on
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

interface ErrorProps {
  onRetry: () => void
  title?: string
  body?: string
  fallbackHref?: string
}

/**
 * The questions failed to load (a read error, not an empty bank): say so and
 * offer a retry, instead of the "no questions yet" page, which would be untrue.
 */
export function SessionError({
  onRetry,
  title = "Couldn't load the questions",
  body = 'Something went wrong reading them on this device. Try again. Your saved progress is safe.',
  fallbackHref = '/practice',
}: ErrorProps) {
  return (
    <Frame fallbackHref={fallbackHref}>
      <ErrorState title={title} body={body} onRetry={onRetry} />
    </Frame>
  )
}
