import { useState, useEffect, useMemo, useCallback, useRef, type ReactElement } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { SearchMinusOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Text } from '../ui/Text'
import { ListingCard } from '../explore/ListingCard'
import { LogoTile } from '../explore/LogoTile'
import { ExploreGrid, GridSkeleton } from '../explore/ExploreGrid'
import type { BadgeSpec } from '../explore/exploreModel'
import { useSyncSettled } from '../explore/useSyncSettled'
import { normalizeSchoolType, type SchoolTypeBucket } from '../../utils/schoolType'
import { passesFreeTuitionFilter } from '../../utils/freeTuitionFilter'
import { parseSchoolSearchIntent } from '../../utils/schoolSearchIntent'
import { fold } from '../../utils/fold'
import { SchoolFiltersSheet } from './SchoolFiltersSheet'
import {
  activeFilterCount, confidenceBadge, filterSummary, schoolRowSubtitle, splitListField,
  NO_SCHOOL_FILTERS, type SchoolFilters,
} from './schoolModel'

// ---------------------------------------------------------------------------
// Shared tertiary-schools directory: data load + region/type/free-tuition
// filters + a virtualised, responsive list of school rows. Used by the
// /schools screen and by Explore → Schools & exams. The search query and the
// Filters button belong to the host screen; the filters themselves live on
// a Sheet this component owns (SchoolFiltersSheet).
// ---------------------------------------------------------------------------

export interface SchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  city: string | null
  type: string | null
  isSuc: boolean
  isLuc: boolean
  dataConfidence: string | null
  freeTuition: boolean | null
  entranceExamAcronym: string | null
  /** Raw JSON-encoded text[]: only counted for the row's subtitle. */
  coursesOffered: string | null
  /** Raw JSON-encoded text[] from university_profiles.requirements — only used
   *  for a "Requirements listed" presence badge, so it stays unparsed here. */
  requirements: string | null
}

function schoolBadges(s: SchoolRow): BadgeSpec[] {
  const out: BadgeSpec[] = []
  if (s.freeTuition) out.push({ label: 'Free tuition', tone: 'success' })
  if (splitListField(s.requirements).length > 0) out.push({ label: 'Requirements listed', tone: 'neutral' })
  const conf = confidenceBadge(s.dataConfidence)
  if (conf) out.push(conf)
  return out
}

const TYPE_ORDER: SchoolTypeBucket[] = ['SUC', 'LUC', 'State College', 'Private', 'Other']

const openSchool = (id: string) => router.push(`/schools/${id}` as never)
const keyOf = (s: SchoolRow) => s.id
const renderSchool = (s: SchoolRow) => (
  <ListingCard
    leading={<LogoTile name={s.name} acronym={s.acronym} />}
    title={s.name}
    meta={schoolRowSubtitle(s) || undefined}
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
  /** Optional element scrolled above the school list (e.g. Explore's Entrance exams). */
  listHeader?: ReactElement | null
  /** The host's Filters button opens the filter sheet. */
  filtersOpen?: boolean
  onCloseFilters?: () => void
  /** Reports how many filters are on, for the host's Filters button. */
  onFilterCountChange?: (count: number) => void
}

export function SchoolsDirectory({
  query, onClearQuery, bottomInset = spacing.xxxl, defaultRegion = null, listHeader = null,
  filtersOpen = false, onCloseFilters, onFilterCountChange,
}: SchoolsDirectoryProps) {
  const db = useDb()
  const { theme: t } = useTheme()
  const syncSettled = useSyncSettled()

  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [filters, setFilters] = useState<SchoolFilters>(NO_SCHOOL_FILTERS)

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
        city:                schoolsTable.city,
        type:                schoolsTable.type,
        isSuc:               schoolsTable.isSuc,
        isLuc:               schoolsTable.isLuc,
        dataConfidence:      profilesTable.dataConfidence,
        freeTuition:         profilesTable.freeTuition,
        entranceExamAcronym: profilesTable.entranceExamAcronym,
        coursesOffered:      profilesTable.coursesOffered,
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
  // Once only: a later refetch (sync, retry) never re-applies it over the
  // student's own choice ("All regions", Clear filters).
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || !defaultRegion || schools.length === 0) return
    preselected.current = true
    if (schools.some(s => s.region === defaultRegion)) {
      setFilters(prev => (prev.region ? prev : { ...prev, region: defaultRegion }))
    }
  }, [defaultRegion, schools])
  const changeFilters = useCallback((next: SchoolFilters) => {
    preselected.current = true
    setFilters(next)
  }, [])

  const count = activeFilterCount(filters)
  useEffect(() => { onFilterCountChange?.(count) }, [count, onFilterCountChange])
  // The host's Filters button outlives this list (a section switch unmounts it).
  useEffect(() => () => onFilterCountChange?.(0), [onFilterCountChange])

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
    const effRegion = filters.region ?? intent.region
    const effFree = filters.freeTuitionOnly || intent.freeTuitionOnly
    return schools.filter(s => {
      if (nameQ && !(
        fold(s.name).includes(nameQ) ||
        fold(s.acronym).includes(nameQ)
      )) return false
      if (effRegion && s.region !== effRegion) return false
      if (filters.type && normalizeSchoolType(s.type) !== filters.type) return false
      // SUC/LUC count as free tuition (RA 10931) even without a profile row.
      if (effFree && !passesFreeTuitionFilter(s, s.freeTuition)) return false
      return true
    })
  }, [schools, intent, filters])

  const filtersActive = count > 0 || !!query.trim()
  const clearFilters = useCallback(() => {
    changeFilters(NO_SCHOOL_FILTERS)
    onClearQuery?.()
  }, [onClearQuery, changeFilters])

  // The sheet only opens over a loaded list; a reload or an error closes it
  // (so it never reappears on its own once the list is back).
  useEffect(() => {
    if (status !== 'ready' && filtersOpen) onCloseFilters?.()
  }, [status, filtersOpen, onCloseFilters])

  if (status === 'loading') return <GridSkeleton label="Loading schools" />
  if (status === 'error') {
    return <ErrorState title="Couldn't load the schools directory" onRetry={() => setAttempt(a => a + 1)} />
  }

  // The filters that are on stay visible above the list (they live on a
  // sheet now), with a one-tap way back.
  const summary = count > 0 ? (
    <View
      testID="school-filter-summary"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}
    >
      <Text role="footnote" color={t.textSecondary} style={{ flexShrink: 1 }}>
        {`Filtered: ${filterSummary(filters)}`}
      </Text>
      <Button label="Clear" variant="ghost" size="sm" accessibilityLabel="Clear filters" onPress={() => changeFilters(NO_SCHOOL_FILTERS)} />
    </View>
  ) : null

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
      {listHeader}
      {summary}
      {filtered.length > 0 ? (
        <Text role="footnote" color={t.textSecondary} accessibilityLiveRegion="polite" aria-live="polite">
          {filtered.length} school{filtered.length !== 1 ? 's' : ''}
        </Text>
      ) : null}
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      {/* iOS native tabs track the first scroll view in the screen's first-
          descendant chain, so the vertical list leads this view (no rail
          ahead of it; the filters are on a sheet). */}
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
      <SchoolFiltersSheet
        visible={filtersOpen}
        onClose={() => onCloseFilters?.()}
        filters={filters}
        onChange={changeFilters}
        types={types}
        regions={regions}
        resultCount={filtered.length}
      />
    </View>
  )
}
