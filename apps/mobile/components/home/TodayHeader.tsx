import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Bell1Outlined, Bell1Solid } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Avatar } from '../ui/Avatar'
import { Glass } from '../ui/Glass'
import { Text } from '../ui/Text'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { LargeTitleHeader } from '../navigation/LargeTitleHeader'
import { GlassIconButton } from '../navigation/GlassIconButton'

function phHour(): number {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 8 * 3_600_000).getHours()
}

function timeGreeting(): string {
  const h = phHour()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Hoisted: building an Intl formatter is slow, so do it once per JS load.
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' })

/** The eyebrow date, day before month: "Sunday, 12 October". */
export function eyebrowDate(d: Date): string {
  return `${WEEKDAY.format(d)}, ${d.getDate()} ${MONTH.format(d)}`
}

const LONG_NAME_CHARS = 12
const { visual: VISUAL, hit: HIT } = layout.headerButton

interface Props {
  fullName: string
  streakDays: number
  remindersOn: boolean
  onOpenReminders: () => void
  /** Web-only refresh control (renders nothing on native). */
  refreshControl?: React.ReactNode
}

/**
 * Today's large-title header (iOS redesign P4):
 *
 *   top row  - the date eyebrow (footnote, uppercase, textSecondary) and the
 *              controls: refresh on web, reminders, and the glass avatar
 *              that opens the Profile sheet
 *   title    - the greeting in the large-title role, at full width, so a
 *              long name wraps at a word boundary instead of being squeezed
 *              beside the controls
 *
 * The greeting is one accessible header ("Good morning, Ana"), never
 * truncated. Once it scrolls away the glass band reads "Today".
 */
export function TodayHeader({ fullName, streakDays, remindersOn, onOpenReminders, refreshControl }: Props) {
  const { theme: t } = useTheme()
  const compact = useBreakpoint() === 'compact'
  const firstName = fullName.trim().split(/\s+/)[0] || 'Student'
  const greeting = timeGreeting()
  // A single word can't wrap. Past ~12 letters the 34pt large title would
  // overflow a 320pt phone at large font scale and split mid-word, so a very
  // long first name steps down to title1.
  const longName = compact && firstName.length > LONG_NAME_CHARS

  return (
    <LargeTitleHeader title="Today" testID="today-header">
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.xs }}>
        <View testID="today-header-top" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text
            role="footnote"
            color={t.textSecondary}
            chrome
            style={{ flex: 1, minWidth: 0, fontWeight: '600', textTransform: 'uppercase' }}
          >
            {eyebrowDate(new Date())}
          </Text>
          {refreshControl}
          <GlassIconButton
            icon={remindersOn ? Bell1Solid : Bell1Outlined}
            onPress={onOpenReminders}
            accessibilityLabel="Study reminders"
            accessibilityHint="Opens the study reminder settings"
            accessibilityValue={{ text: remindersOn ? 'On' : 'Off' }}
          />
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            accessibilityHint="Opens your profile and settings"
            style={(state) => {
              const { pressed, focused } = state as WebPressableState
              return [
                { minWidth: HIT, minHeight: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <Glass testID="profile-glass" variant="button" style={{ width: VISUAL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View {...decorative}>
                <Avatar name={fullName} size={32} />
              </View>
            </Glass>
          </Pressable>
        </View>

        <View
          testID="today-header-greeting"
          accessible
          accessibilityRole="header"
          aria-level={1}
          accessibilityLabel={`${greeting}, ${firstName}`}
        >
          <Text role="largeTitle" maxFontSizeMultiplier={1.4}>
            {`${greeting}, `}
            <Text role={longName ? 'title1' : 'largeTitle'} maxFontSizeMultiplier={1.4}>
              {firstName}
            </Text>
          </Text>
        </View>
        {streakDays > 0 ? (
          <Text role="subheadline" color={t.textSecondary}>{`${streakDays}-day streak`}</Text>
        ) : null}
      </View>
    </LargeTitleHeader>
  )
}
