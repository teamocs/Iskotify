import { View, Text } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Book1Outlined, CalendarDaysOutlined, StopwatchOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Screen } from '../ui/Screen'
import { TwoColumn } from '../ui/TwoColumn'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { ListRow } from '../ui/ListRow'
import { PageTitle } from '../ui/PageTitle'
import { StatNumber } from '../ui/StatNumber'
import { decorative, heading } from '../ui/a11y'
import { DetailTopBar } from '../explore/DetailTopBar'

export interface ChooserOption {
  key: string
  title: string
  subtitle: string
  onPress: () => void
  /** Drawn icon (Lineicons element). Decorative. */
  icon?: React.ReactNode
  /** Spoken name, when the visible title alone is ambiguous. */
  accessibilityLabel?: string
}

export interface RecommendedOption extends ChooserOption {
  /** The primary button's label ("Start review"). */
  actionLabel: string
}

interface Props {
  title: string
  lead?: string
  fallbackHref: string
  /** The one next step: a hero card carrying the screen's only maroon button. */
  recommended?: RecommendedOption
  /** The other ways in, as quiet rows. */
  options: ChooserOption[]
  optionsTitle?: string
  /** A non-interactive note under the options (e.g. "Mock exam coming soon"). */
  note?: { title: string; body: string }
  /** Supporting facts: beside the options on desktop, below them on a phone. */
  aside?: React.ReactNode
  testID?: string
}

/**
 * How practice sessions start (topic, saved deck, exam, focus listing):
 * direction C's "One Next Step". The recommended way in is a hero card with
 * the only primary button; every other mode is a quiet row. On desktop the
 * supporting facts sit in a second column instead of stretching the page.
 */
export function SessionChooser({
  title, lead, fallbackHref, recommended, options, optionsTitle = 'Other ways to practise', note, aside, testID,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const compact = bp === 'compact'
  const twoUp = bp === 'expanded' && !!aside

  const main = (
    <View style={{ gap: spacing.xxl }}>
      {recommended ? (
        <Card elevated testID="chooser-recommended" style={{ padding: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            {recommended.icon ? (
              <View
                {...decorative}
                style={{
                  width: 48, height: 48, borderRadius: radius.lg, borderCurve: 'continuous',
                  backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center',
                }}
              >
                {recommended.icon}
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              <Text {...heading(2)} style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                {recommended.title}
              </Text>
              <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{recommended.subtitle}</Text>
            </View>
          </View>
          <Button
            label={recommended.actionLabel}
            accessibilityLabel={recommended.accessibilityLabel ?? `${recommended.actionLabel}: ${recommended.title}`}
            size="lg"
            fullWidth={compact}
            style={compact ? undefined : { alignSelf: 'flex-start' }}
            onPress={recommended.onPress}
          />
        </Card>
      ) : null}

      {options.length > 0 || note ? (
        <View style={{ gap: spacing.sm }}>
          {recommended ? (
            <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{optionsTitle}</Text>
          ) : null}
          {options.length > 0 ? (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {options.map((o, i) => (
                <View key={o.key} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: t.divider }}>
                  <ListRow
                    title={o.title}
                    subtitle={o.subtitle}
                    leading={o.icon}
                    onPress={o.onPress}
                    accessibilityLabel={o.accessibilityLabel ?? `${o.title}, ${o.subtitle}`}
                  />
                </View>
              ))}
            </Card>
          ) : null}
          {note ? (
            <View
              style={{
                padding: spacing.lg, gap: spacing.xs, borderRadius: radius.xl, borderCurve: 'continuous',
                borderWidth: 1, borderColor: t.border, borderStyle: 'dashed',
              }}
            >
              <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{note.title}</Text>
              <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{note.body}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )

  return (
    <Screen
      testID={testID}
      header={<DetailTopBar bare fallbackHref={fallbackHref} />}
      width={twoUp ? 'wide' : 'reading'}
    >
      <PageTitle title={title} lead={lead} />
      {aside ? <TwoColumn primary={main} secondary={aside} /> : main}
    </Screen>
  )
}

/** A quiet facts panel for the chooser's second column. */
export function ChooserAside({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <Card style={{ gap: spacing.md }}>
      <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{title}</Text>
      {children}
    </Card>
  )
}

interface FlashcardModeProps {
  title: string
  /** What the pool is — used in the facts panel heading. */
  noun: 'topic' | 'deck' | 'set'
  /** Context before the card count in the lead (e.g. the listing name). */
  context?: string
  /** Deduped card count (what the session can actually serve). */
  total: number
  dueCount: number
  fallbackHref: string
  onChoose: (mode: 'quick' | 'full' | 'due') => void
}

/**
 * Quick / Full / Due for a card pool (a topic or a saved deck). Due cards are
 * the next step when there are any; otherwise the quick set is.
 */
export function FlashcardModeChooser({ title, noun, context, total, dueCount, fallbackHref, onChoose }: FlashcardModeProps) {
  const { theme: t } = useTheme()
  const fullCount = Math.min(total, 60)
  const quick: ChooserOption = {
    key: 'quick', title: 'Quick (15)', subtitle: 'About 15 sampled questions, shuffled',
    icon: <Lineicons icon={StopwatchOutlined} size={20} color={t.textSecondary} />, onPress: () => onChoose('quick'),
  }
  const full: ChooserOption = {
    key: 'full', title: 'Full', subtitle: `All ${fullCount} questions, in order`,
    icon: <Lineicons icon={Book1Outlined} size={20} color={t.textSecondary} />, onPress: () => onChoose('full'),
  }
  return (
    <SessionChooser
      title={title}
      lead={`${context ? `${context} · ` : ''}${total} ${total === 1 ? 'card' : 'cards'} to practise`}
      fallbackHref={fallbackHref}
      recommended={dueCount > 0
        ? {
            key: 'due', title: `Due today (${dueCount})`, subtitle: 'Cards scheduled for review, most overdue first',
            actionLabel: 'Start review', icon: <Lineicons icon={CalendarDaysOutlined} size={24} color={t.accentText} />,
            onPress: () => onChoose('due'),
          }
        : { ...quick, actionLabel: 'Start quick set', icon: <Lineicons icon={StopwatchOutlined} size={24} color={t.accentText} /> }}
      options={dueCount > 0 ? [quick, full] : [full]}
      aside={(
        <ChooserAside title={`In this ${noun}`}>
          <View style={{ flexDirection: 'row', gap: spacing.xl, flexWrap: 'wrap' }}>
            <StatNumber value={total} label="Cards" />
            <StatNumber value={dueCount} label="Due now" />
          </View>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            Every answer comes with an explanation. Cards you miss come back sooner.
          </Text>
        </ChooserAside>
      )}
    />
  )
}
