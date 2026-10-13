import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Shield2CheckOutlined, FileQuestionOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../../hooks/useDb'
import {
  careerCountries as countriesTable,
  careerDestinations as destinationsTable,
  careerCourses as coursesTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { countryCodeFromName } from '../../../utils/careerSlug'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { Badge } from '../../../components/ui/Badge'
import { InsetGroup, InsetRow } from '../../../components/ui/InsetGroup'
import { LargeTitleHeader } from '../../../components/navigation/LargeTitleHeader'
import { Skeleton } from '../../../components/ui/Skeleton'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { decorative } from '../../../components/ui/a11y'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { spacing, radius, iosTextStyle } from '../../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CountryRow {
  code: string
  name: string | null
  region: string | null
  immigrationSystem: string | null
  whyDemand: string | null
  languageRequired: string | null
  prPathway: string | null
  notes: string | null
  remoteUpdatedAt: number | null
}

interface DestRow {
  id: string
  courseId: string | null
  country: string | null
  demandRating: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryLocal: string | null
  salaryType: string | null
  timelineMonths: number | null
  notes: string | null
  remoteUpdatedAt: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSalary(dest: DestRow): string {
  if (dest.salaryMin != null && dest.salaryMax != null) {
    return `$${dest.salaryMin.toLocaleString()}–${dest.salaryMax.toLocaleString()}/yr`
  }
  return dest.salaryLocal ?? 'Salary not listed'
}

function demandOrder(rating: string | null): number {
  switch ((rating ?? '').toLowerCase()) {
    case 'very high': return 4
    case 'high':      return 3
    case 'moderate':  return 2
    case 'low':       return 1
    default:          return 0
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CareerCountryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const db = useDb()
  const { theme: t } = useTheme()

  const [country, setCountry] = useState<CountryRow | null>(null)
  const [dests, setDests]     = useState<DestRow[]>([])
  const [courseNameMap, setCourseNameMap] = useState<Map<string, string>>(new Map())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    async function load() {
      setStatus('loading')
      const [countryRows, allDests, allCourses] = await Promise.all([
        db.select().from(countriesTable).where(eq(countriesTable.code, code)).limit(1),
        db.select().from(destinationsTable),
        db.select({ courseId: coursesTable.courseId, name: coursesTable.name }).from(coursesTable),
      ])

      setCountry((countryRows[0] ?? null) as CountryRow | null)

      // Build a Map<courseId, name> for display
      const nameMap = new Map<string, string>()
      for (const c of allCourses) {
        if (c.courseId && c.name) nameMap.set(c.courseId, c.name)
      }
      setCourseNameMap(nameMap)

      // Filter & sort destinations that map to this country code
      const matched = (allDests as DestRow[])
        .filter(d => d.country != null && countryCodeFromName(d.country) === code)
        .sort((a, b) => demandOrder(b.demandRating) - demandOrder(a.demandRating))
      setDests(matched)

      setStatus('ready')
    }
    load().catch((e: unknown) => {
      console.warn('[country] load failed:', e)
      setStatus('error')
    })
  }, [db, code, attempt])

  const s = useMemo(() => StyleSheet.create({
    root:     { flex: 1, backgroundColor: t.bg },
    whyTxt:   iosTextStyle('body', t.textSecondary),
    empty:    iosTextStyle('footnote', t.textSecondary),
  }), [t])

  // ── Loading / error / missing ──────────────────────────────────────────────

  if (status !== 'ready' || country === null) {
    return (
      <SafeAreaView style={s.root}>
        <DetailTopBar fallbackHref="/explore?section=destinations" />
        <ScreenScroll tabBarInset={false}>
          {status === 'loading' ? (
            <View accessible accessibilityLabel="Loading" aria-busy style={{ gap: spacing.lg, paddingTop: spacing.md }}>
              <Skeleton width="60%" height={28} />
              <Skeleton height={120} radius={radius.card} />
              <Skeleton height={180} radius={radius.card} />
            </View>
          ) : status === 'error' ? (
            <ErrorState title="Couldn't load this country" onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <EmptyState
              icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
              title="We couldn't find this country"
              actionLabel="Back to Explore"
              onAction={() => router.replace('/explore?section=destinations')}
            />
          )}
        </ScreenScroll>
      </SafeAreaView>
    )
  }

  const profileRows: [string, string | null][] = [
    ['Immigration', country.immigrationSystem],
    ['Language', country.languageRequired],
    ['PR and citizenship', country.prPathway],
    ['Notes', country.notes],
  ]

  return (
    <SafeAreaView style={s.root}>
      <DetailTopBar fallbackHref="/explore?section=destinations" />
      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.xl, paddingTop: spacing.sm }}>

        <View style={{ gap: spacing.sm }}>
          <LargeTitleHeader testID="country-title" eyebrow={country.region ?? undefined} title={country.name ?? code} />
          {country.whyDemand ? <Text style={s.whyTxt} maxFontSizeMultiplier={1.6}>{country.whyDemand}</Text> : null}
        </View>

        <View>
          <SectionHeader title="Courses in demand here" subtitle="Highest demand first" />
          {dests.length > 0 ? (
            <InsetGroup inset={false}>
              {dests.map((dest) => {
                const name = dest.courseId != null ? (courseNameMap.get(dest.courseId) ?? dest.courseId) : 'Unnamed course'
                const sub = [fmtSalary(dest), dest.timelineMonths != null ? `${dest.timelineMonths}-month timeline` : null]
                  .filter(Boolean).join(' · ')
                return (
                  <InsetRow
                    key={dest.id}
                    title={name}
                    subtitle={sub}
                    trailing={dest.demandRating ? <Badge label={dest.demandRating} tone="success" /> : undefined}
                    onPress={dest.courseId ? () => router.push(`/career/${dest.courseId}?country=${code}` as never) : undefined}
                    accessibilityHint="Opens the course's career paths"
                  />
                )
              })}
            </InsetGroup>
          ) : (
            <Text style={s.empty} maxFontSizeMultiplier={1.6}>No course data for this country yet.</Text>
          )}
        </View>

        {profileRows.some(([, v]) => v) ? (
          <InsetGroup inset={false} header="Country profile" testID="country-profile">
            {profileRows.filter(([, v]) => v).map(([label, value]) => (
              <InsetRow key={label} title={label} subtitle={value ?? undefined} numberOfLines={0} />
            ))}
          </InsetGroup>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.field, backgroundColor: t.warningSurface }}>
          <View {...decorative} style={{ marginTop: 2 }}>
            <Lineicons icon={Shield2CheckOutlined} size={16} color={t.warningStrong} />
          </View>
          <Text style={[iosTextStyle('footnote', t.warningStrong), { flex: 1 }]} maxFontSizeMultiplier={1.6}>
            Check pathways, salary ranges and immigration rules with DMW and official government sources before you decide.
          </Text>
        </View>

      </ScreenScroll>
    </SafeAreaView>
  )
}
