import { useState, useEffect, useMemo, useCallback, type ReactElement } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Buildings1Outlined, SearchMinusOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { FilterChip } from '../ui/Chip'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { ListingCard } from '../explore/ListingCard'
import { ExploreGrid, GridSkeleton } from '../explore/ExploreGrid'
import type { BadgeSpec } from '../explore/exploreModel'
import { useSyncSettled } from '../explore/useSyncSettled'
import { normalizeSchoolType, type SchoolTypeBucket } from '../../utils/schoolType'
import { passesFreeTuitionFilter } from '../../utils/freeTuitionFilter'
import { parseSchoolSearchIntent } from '../../utils/schoolSearchIntent'

// ---------------------------------------------------------------------------
// Shared tertiary-schools directory: data load + region/type/free-tuition
// filters + a virtualised, responsive grid of school cards. Used by the
// /schools screen and by Explore → Schools & exams. The search query is
// supplied by the host screen, which owns the search field.
// ---------------------------------------------------------------------------

export interface SchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  type: string | null
  isSuc: boolean
  isLuc: boolean
  dataConfidence: string | null
  freeTuition: boolean | null
  entranceExamAcronym: string | null
  /** Raw JSON-encoded text[] from university_profiles.requirements — only used
   *  for a "Requirements listed" presence badge, so it stays unparsed here. */
  requirements: string | null
}

/** True when a JSON-encoded text[] column has at least one entry. */
function hasNonEmptyJsonArray(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

/** Data-confidence as a labelled badge (honest about uncertainty; unknown → none). */
function confidenceBadge(level: string | null): BadgeSpec | null {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH': return { label: 'High confidence', tone: 'success' }
    case 'MEDIUM': return { label: 'Medium confidence', tone: 'warning' }
    case 'LOW':
    case 'VERY LOW': return { label: 'Low confidence', tone: 'neutral' }
    default: return null
  }
}

function schoolBadges(s: SchoolRow): BadgeSpec[] {
  const out: BadgeSpec[] = []
  if (s.entranceExamAcronym) out.push({ label: s.entranceExamAcronym, tone: 'accent' })
  if (s.freeTuition) out.push({ label: 'Free tuition', tone: 'success' })
  if (hasNonEmptyJsonArray(s.requirements)) out.push({ label: 'Requirements listed', tone: 'neutral' })
  const conf = confidenceBadge(s.dataConfidence)
  if (conf) out.push(conf)
  return out
}

function schoolMeta(s: SchoolRow): string {
  const place = [s.region, s.province].filter(Boolean).join(', ')
  return [s.acronym, s.type, place].filter(Boolean).join(' · ')
}

const TYPE_ORDER: SchoolTypeBucket[] = ['SUC', 'LUC', 'State College', 'Private', 'Other']

const openSchool = (id: string) => router.push(`/schools/${id}` as never)
const keyOf = (s: SchoolRow) => s.id
const renderSchool = (s: SchoolRow) => (
  <ListingCard
    icon={Buildings1Outlined}
    title={s.name}
    meta={schoolMeta(s)}
    badges={schoolBadges(s)}
    onPress={() => openSchool(s.id)}
    accessibilityHint="Opens the school profile"
  />
)

interface SchoolsDirectoryProps {
  /** Search text (name/acronym), owned by the host screen. */
  query: string
  /** Clear the host's search text (offered by the empty state). */
  onClearQuery?: () => void
  /** Bottom padding for the list (e.g. tab-bar clearance). */
  bottomInset?: number
  /** Optional region to preselect when it exists in the data (canonical form). */
  defaultRegion?: string | null
  /** Optional element scrolled above the school grid (e.g. Explore's Entrance exams). */
  listHeader?: ReactElement | null
}

export function SchoolsDirectory({
  query, onClearQuery, bottomInset = spacing.xxxl, defaultRegion = null, listHeader = null,
}: SchoolsDirectoryProps) {
  const db = useDb()
  const { theme: t } = useTheme()
  const syncSettled = useSyncSettled()

  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [selRegion, setSelRegion] = useState<string | null>(null)
  const [selType, setSelType] = useState<SchoolTypeBucket | null>(null)
  const [freeTuitionOnly, setFreeTuitionOnly] = useState(false)

  // Request sequencing: each run's `alive` flag is cleared by the next run's
  // cleanup (retry, sync settled, new db) and on unmount, so only the newest
  // read is ever applied.
  useEffect(() => {
    let alive = true
    setStatus(prev => (prev === 'ready' ? prev : 'loading'))
    db
      .select({
        id:                  schoolsTable.id,
        name:                schoolsTable.name,
        acronym:             schoolsTable.acronym,
        region:              schoolsTable.region,
        province:            schoolsTable.province,
        type:                schoolsTable.type,
        isSuc:               schoolsTable.isSuc,
        isLuc:               schoolsTable.isLuc,
        dataConfidence:      profilesTable.dataConfidence,
        freeTuition:         profilesTable.freeTuition,
        entranceExamAcronym: profilesTable.entranceExamAcronym,
        requirements:        profilesTable.requirements,
      })
      .from(schoolsTable)
      .leftJoin(profilesTable, eq(schoolsTable.id, profilesTable.schoolId))
      .then(rows => {
        if (!alive) return
        setSchools(rows as SchoolRow[])
        setStatus('ready')
      })
      .catch((e: unknown) => {
        console.warn('[SchoolsDirectory] load failed:', e)
        if (alive) setStatus('error')
      })
    return () => { alive = false }
  }, [db, attempt, syncSettled])

  // Preselect the student's region once the data is loaded, if it exists.
  useEffect(() => {
    if (!defaultRegion || schools.length === 0) return
    if (schools.some(s => s.region === defaultRegion)) setSelRegion(prev => prev ?? defaultRegion)
  }, [defaultRegion, schools])

  const regions = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const s of schools) if (s.region) set.add(s.region)
    return Array.from(set).sort()
  }, [schools])

  // Normalized type buckets (SUC/LUC/Private/State College/Other) instead of
  // one chip per raw free-text `type` (52+ distinct values in production).
  const types = useMemo<SchoolTypeBucket[]>(() => {
    const present = new Set<SchoolTypeBucket>()
    for (const s of schools) present.add(normalizeSchoolType(s.type))
    return TYPE_ORDER.filter(b => present.has(b))
  }, [schools])

  // "free tuition universities in bicol" → region=Bicol, free tuition only,
  // with the filler words stripped so they don't zero out the name match.
  const intent = useMemo(() => parseSchoolSearchIntent(query), [query])

  const filtered = useMemo(() => {
    const nameQ = intent.nameQuery
    const effRegion = selRegion ?? intent.region
    const effFree = freeTuitionOnly || intent.freeTuitionOnly
    return schools.filter(s => {
      if (nameQ && !(
        s.name.toLowerCase().includes(nameQ) ||
        (s.acronym ?? '').toLowerCase().includes(nameQ)
      )) return false
      if (effRegion && s.region !== effRegion) return false
      if (selType && normalizeSchoolType(s.type) !== selType) return false
      // SUC/LUC count as free tuition (RA 10931) even without a profile row.
      if (effFree && !passesFreeTuitionFilter(s, s.freeTuition)) return false
      return true
    })
  }, [schools, intent, selRegion, selType, freeTuitionOnly])

  const filtersActive = freeTuitionOnly || selType !== null || selRegion !== null || !!query.trim()
  const clearFilters = useCallback(() => {
    setFreeTuitionOnly(false)
    setSelType(null)
    setSelRegion(null)
    onClearQuery?.()
  }, [onClearQuery])

  if (status === 'loading') return <GridSkeleton label="Loading schools" />
  if (status === 'error') {
    return <ErrorState title="Couldn't load the schools directory" onRetry={() => setAttempt(a => a + 1)} />
  }

  const header = (
    <View style={{ gap: spacing.sm }}>
      {listHeader}
      {filtered.length > 0 ? (
        <Text style={textStyle('caption', t.textSecondary)} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
          {filtered.length} school{filtered.length !== 1 ? 's' : ''}
        </Text>
      ) : null}
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
      >
        <FilterChip
          label="Free tuition"
          mode="multiple"
          selected={freeTuitionOnly}
          onPress={() => setFreeTuitionOnly(v => !v)}
        />
        {/* One-of-a-group, like Region: "All types" is the way back, so a
            checked radio stays checked when tapped again. */}
        <View accessibilityRole="radiogroup" accessibilityLabel="School type" style={{ flexDirection: 'row', gap: spacing.sm }}>
          <FilterChip label="All types" selected={selType === null} onPress={() => setSelType(null)} />
          {types.map(tp => (
            <FilterChip key={tp} label={tp} selected={selType === tp} onPress={() => setSelType(tp)} />
          ))}
        </View>
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingBottom: spacing.md }}
      >
        {/* bounded: ~17 PH regions; a horizontal chip rail does not need virtualisation */}
        <View accessibilityRole="radiogroup" accessibilityLabel="Region" style={{ flexDirection: 'row', gap: spacing.sm }}>
          <FilterChip label="All regions" selected={selRegion === null} onPress={() => setSelRegion(null)} />
          {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
          {regions.map(r => (
            <FilterChip key={r} label={r} selected={selRegion === r} onPress={() => setSelRegion(r)} />
          ))}
        </View>
      </ScrollView>

      <ExploreGrid
        data={filtered}
        keyExtractor={keyOf}
        renderItem={renderSchool}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        ListEmptyComponent={
          <EmptyState
            icon={<Lineicons icon={SearchMinusOutlined} size={26} color={t.textSecondary} />}
            title="No schools match"
            body={filtersActive
              ? 'Try another region or type, or turn off Free tuition.'
              : 'The schools directory is still syncing. Check back in a moment.'}
            actionLabel={filtersActive ? 'Clear filters' : undefined}
            onAction={filtersActive ? clearFilters : undefined}
          />
        }
      />
    </View>
  )
}
