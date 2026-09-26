import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined, Bell1Solid } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Avatar } from '../ui/Avatar'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

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

// Hoisted: building an Intl formatter is slow — do it once per JS load.
// Phones get the short form ("Sat, Sep 26") so it never splits beside the
// controls; wider screens spell it out.
const DATE_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const DATE_SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const LONG_NAME_CHARS = 12

interface Props {
  fullName: string
  streakDays: number
  remindersOn: boolean
  onOpenReminders: () => void
  /** Web-only refresh control (renders nothing on native). */
  refreshControl?: React.ReactNode
}

/**
 * Today's header, in two tiers so nothing competes for width:
 *
 *   top row   — the date (quiet, left) and the real controls (right):
 *               refresh on web, reminders, and the avatar that opens Profile
 *   heading   — the greeting at full width. On a phone the first name gets
 *               its own line under "Good morning," so a long name wraps at a
 *               word boundary instead of being squeezed into a third of the
 *               row; wider screens keep it on one line.
 *
 * The heading is one accessible header ("Good morning, Ana"), never truncated.
 */
export function TodayHeader({ fullName, streakDays, remindersOn, onOpenReminders, refreshControl }: Props) {
  const { theme: t } = useTheme()
  const compact = useBreakpoint() === 'compact'
  const firstName = fullName.trim().split(/\s+/)[0] || 'Student'
  const greeting = timeGreeting()
  const date = (compact ? DATE_SHORT : DATE_LONG).format(new Date())
  // A single word can't wrap. Past ~12 letters the 26pt title role would
  // overflow a 320pt phone at large font scale and split mid-word, so a very
  // long first name steps down to the headline role instead.
  const nameRole = compact && firstName.length > LONG_NAME_CHARS ? 'headline' : 'title'

  return (
    <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md }}>
      <View testID="today-header-top" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text
          style={[textStyle('label', t.textSecondary), { flex: 1, minWidth: 0 }]}
          maxFontSizeMultiplier={1.6}
        >
          {date}
        </Text>
        {refreshControl}
        <Pressable
          onPress={onOpenReminders}
          accessibilityRole="button"
          accessibilityLabel="Study reminders"
          accessibilityHint={remindersOn ? 'Reminders are on' : 'Reminders are off'}
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressableState
            return [
              {
                width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]
          }}
        >
          <View {...decorative}>
            <Lineicons icon={remindersOn ? Bell1Solid : Bell1Outlined} size={22} color={remindersOn ? t.accentText : t.textSecondary} />
          </View>
        </Pressable>
        <Avatar
          name={fullName}
          size={36}
          onPress={() => router.push('/profile')}
          accessibilityLabel="Profile"
          accessibilityHint="Opens your profile and settings"
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <View
          testID="today-header-greeting"
          accessible
          accessibilityRole="header"
          aria-level={1}
          accessibilityLabel={`${greeting}, ${firstName}`}
        >
          {compact ? (
            <>
              <Text style={[textStyle('headline', t.textSecondary), { fontFamily: fonts.headingReg }]} maxFontSizeMultiplier={1.4}>
                {`${greeting},`}
              </Text>
              <Text style={[textStyle(nameRole, t.textPrimary), { fontFamily: fonts.heading }]} maxFontSizeMultiplier={1.4}>
                {firstName}
              </Text>
            </>
          ) : (
            <Text style={[textStyle('title', t.textPrimary), { fontFamily: fonts.headingReg }]} maxFontSizeMultiplier={1.4}>
              {`${greeting}, `}
              <Text style={{ fontFamily: fonts.heading }}>{firstName}</Text>
            </Text>
          )}
        </View>
        {streakDays > 0 ? (
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            {`${streakDays}-day streak`}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
