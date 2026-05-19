import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bolt2Outlined } from '@lineiconshq/free-icons'
import { useHomeStats, type CalendarDay, type FocusedListing } from '../../hooks/useHomeStats'
import { useAnalytics } from '../../hooks/useAnalytics'
import KuyaBawMascot from '../../assets/images/kuya-baw-mascot.svg'

function CalendarStrip({ days }: { days: CalendarDay[] }) {
  if (days.length === 0) return null
  return (
    <View style={cs.row}>
      {days.map((d, i) => (
        <View key={i} style={cs.dayCol}>
          <Text style={[cs.letter, d.isToday && cs.letterToday]}>{d.dayLetter}</Text>
          <View style={[
            cs.circle,
            d.isToday && cs.circleToday,
            d.hasExam && !d.isToday && cs.circleExam,
          ]}>
            <Text style={[cs.num, d.isToday && cs.numToday]}>{d.dayNum}</Text>
          </View>
          <View style={[cs.dot, d.hasPractice && cs.dotActive, d.hasExam && cs.dotExam]} />
        </View>
      ))}
    </View>
  )
}

function phHour(): number {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 8 * 3_600_000).getHours()
}

function timeGreeting(): string {
  const h = phHour()
  if (h < 12) return 'Good morning ☀️'
  if (h < 18) return 'Good afternoon 🌤'
  return 'Good evening 🌙'
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86_400_000)
}

export default function HomeScreen() {
  const { listing, daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId, fullName, calendarDays, focusedListings } = useHomeStats()
  const { sessionCount, streak } = useAnalytics('overall')

  const quickTopicId = weakTopics[0]?.topicId ?? firstTopicId

  const kuyaMsg = listing
    ? weakTopics.length > 0
      ? `Kamusta! ${daysLeft ?? '?'} days na lang bago ang ${listing.title}. Mag-focus tayo sa ${weakTopics[0]?.topicName ?? ''} ngayon — ito ang pinaka-mahina mo. Kaya mo 'yan! 💪`
      : `Kamusta! ${daysLeft ?? '?'} days na lang bago ang ${listing.title}. Magsimula na tayo! Kaya mo 'yan! 💪`
    : "Kamusta! Handa ka na ba? Simulan na natin ang pag-aaral! 💪"

  const now = Date.now()
  const upcomingDates = focusedListings
    .map(l => {
      const keyDate = l.type === 'exam'
        ? (l.examDate ?? l.deadline)
        : (l.deadline ?? l.examDate)
      const label = l.type === 'exam' ? 'Exam' : 'Deadline'
      return { ...l, keyDate, label }
    })
    .filter(l => l.keyDate != null && l.keyDate >= now)
    .sort((a, b) => (a.keyDate ?? 0) - (b.keyDate ?? 0))
    .slice(0, 4)

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Greeting row — ENLARGED */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
            <Lineicons icon={Gear1Outlined} size={20} color="rgba(255,255,255,0.62)" />
          </TouchableOpacity>
        </View>

        <View style={s.inner}>

          {/* Kuya Baw AI Coach card — LARGER MASCOT */}
          <View style={s.kuyaCard}>
            <View style={s.kuyaRow}>
              <View style={s.kuyaAvatarLg}>
                <KuyaBawMascot width={80} height={80} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.kuyaNameRow}>
                  <Text style={s.kuyaName}>Kuya Baw</Text>
                  <View style={s.kuyaBadge}><Text style={s.kuyaBadgeText}>AI Coach</Text></View>
                </View>
                <Text style={s.kuyaText}>"{kuyaMsg}"</Text>
              </View>
            </View>
          </View>

          {/* 7-day calendar strip — MOVED BELOW AI COACH */}
          <View style={s.calendarWrap}>
            <CalendarStrip days={calendarDays} />
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fca5a5' }]}>{daysLeft ?? '—'}</Text>
              <Text style={s.statLbl}>DAYS LEFT</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{todayAccuracy !== null ? `${todayAccuracy}%` : '—'}</Text>
              <Text style={s.statLbl}>ACCURACY</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fbbf24' }]}>{streakDays > 0 ? `${streakDays}🔥` : '—'}</Text>
              <Text style={s.statLbl}>STREAK</Text>
            </View>
          </View>

          {/* Mini progress card */}
          {sessionCount > 0 && (
            <TouchableOpacity
              style={s.progressCard}
              onPress={() => router.push('/(tabs)/analytics')}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.progressTitle}>My Progress</Text>
                <Text style={s.progressSub}>
                  {sessionCount} session{sessionCount !== 1 ? 's' : ''}{streak > 0 ? ` · ${streak}🔥 streak` : ''}
                </Text>
              </View>
              <Text style={s.progressChevron}>›</Text>
            </TouchableOpacity>
          )}

          {/* Quick Practice CTA */}
          {quickTopicId ? (
            <TouchableOpacity style={s.quickBtn} onPress={() => router.push(`/practice/${quickTopicId}`)}>
              <View style={s.quickIcon}>
                <Lineicons icon={Bolt2Outlined} size={15} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.quickTitle}>Quick Practice</Text>
                <Text style={s.quickSub}>
                  {weakTopics[0]?.topicName ?? 'Start a topic'} · recommended
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          ) : null}

          {/* Weak Areas */}
          <View style={s.secRow}>
            <Text style={s.secTitle}>Weak Areas</Text>
          </View>
          {weakTopics.length > 0 ? (
            <View style={s.chips}>
              {weakTopics.map(t => (
                <TouchableOpacity key={t.topicId} onPress={() => router.push(`/practice/${t.topicId}`)}>
                  <View style={s.chip}>
                    <Text style={s.chipText}>{t.topicName}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={s.empty}>Start practicing to see weak areas</Text>
          )}

          {/* Upcoming Important Dates */}
          <View style={[s.secRow, { marginTop: 16 }]}>
            <Text style={s.secTitle}>Upcoming Dates</Text>
          </View>
          {upcomingDates.length > 0 ? (
            <View style={{ gap: 8, marginBottom: 4 }}>
              {upcomingDates.map(item => {
                const d = daysUntil(item.keyDate!)
                const dayColor = d < 14 ? '#f87171' : d < 30 ? '#fbbf24' : '#4ade80'
                return (
                  <View key={item.slug} style={s.upcomingCard}>
                    <View style={s.upcomingIcon}>
                      <Text style={{ fontSize: 16 }}>{item.type === 'exam' ? '📝' : '🎓'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.upcomingTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.upcomingMeta}>{item.label} · {formatShortDate(item.keyDate!)}</Text>
                    </View>
                    <View style={[s.upcomingBadge, { backgroundColor: `${dayColor}18`, borderColor: `${dayColor}40` }]}>
                      <Text style={[s.upcomingDays, { color: dayColor }]}>{d}d</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : (
            <Text style={s.empty}>
              {focusedListings.length === 0
                ? 'Add scholarships and exams to your focus list to track upcoming dates'
                : 'No upcoming dates — all dates may have passed'}
            </Text>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Calendar strip styles ─────────────────────────────────────────────────────
const cs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dayCol: { alignItems: 'center', gap: 3, flex: 1 },
  letter: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontFamily: 'Lexend_600SemiBold' },
  letterToday: { color: '#fca5a5' },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  circleToday: { backgroundColor: '#fff' },
  circleExam: { borderWidth: 1.5, borderColor: '#fca5a5' },
  num: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.62)', fontFamily: 'Outfit_700Bold' },
  numToday: { color: '#1a1a2e' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: '#60a5fa' },
  dotExam: { backgroundColor: '#fca5a5' },
})

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { paddingBottom: 100 },
  inner: { paddingHorizontal: 16 },

  // Greeting — ENLARGED
  greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 },
  greetTime: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 2, fontFamily: 'Lexend_400Regular' },
  greetName: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
  iconBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },

  // Kuya Baw — LARGER MASCOT
  calendarWrap: { paddingVertical: 10 },
  kuyaCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 22, padding: 14, marginBottom: 10 },
  kuyaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kuyaAvatarLg: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', flexShrink: 0 },
  kuyaNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  kuyaName: { fontSize: 13, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  kuyaBadge: { marginLeft: 'auto', backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  kuyaBadgeText: { fontSize: 8, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  kuyaText: { fontSize: 11.5, color: 'rgba(255,255,255,0.80)', lineHeight: 18, fontFamily: 'Lexend_400Regular' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  statLbl: { fontSize: 8.5, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Lexend_600SemiBold' },

  // Quick Practice
  quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  quickIcon: { width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  quickSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  chevron: { color: 'rgba(255,255,255,0.45)', fontSize: 22 },

  // Section headers
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, marginTop: 8 },
  secTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },

  // Weak Areas
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: '600', color: '#f87171', fontFamily: 'Lexend_600SemiBold' },
  empty: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginBottom: 8 },

  // Progress card
  progressCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  progressSub: { fontSize: 10, color: 'rgba(255,255,255,0.50)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  progressChevron: { color: 'rgba(255,255,255,0.38)', fontSize: 20 },

  // Upcoming Dates
  upcomingCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upcomingIcon: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  upcomingTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  upcomingMeta: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  upcomingBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  upcomingDays: { fontSize: 12, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
})
