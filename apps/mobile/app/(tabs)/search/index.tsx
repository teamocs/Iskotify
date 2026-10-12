import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Text, View } from 'react-native'
import { router, Stack } from 'expo-router'
import type { SearchBarCommands } from 'react-native-screens'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Buildings1Outlined, CertificateBadge1Outlined, GraduationCap1Outlined, Search1Outlined, SearchMinusOutlined,
  Globe1Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../../../hooks/useDb'
import { useSyncStatus } from '../../../hooks/useSyncStatus'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, textStyle } from '../../../theme/tokens'
import { listings as listingsTable, tertiarySchools, universityProfiles } from '../../../db/schema'
import { Screen } from '../../../components/ui/Screen'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { ListRow } from '../../../components/ui/ListRow'
import { decorative } from '../../../components/ui/a11y'
import { TabHeader } from '../../../components/TabHeader'
import { SearchField } from '../../../components/explore/SearchField'
import { ListingCard } from '../../../components/explore/ListingCard'
import { GridSkeleton, StaticGrid } from '../../../components/explore/ExploreGrid'
import { dateUrgency, truncateQuery, type BadgeSpec } from '../../../components/explore/exploreModel'
import { useSyncSettled } from '../../../components/explore/useSyncSettled'
import {
  EMPTY_RESULTS, listingMeta, resultCount, schoolMeta, searchCatalog, upcomingListings,
  type SearchListing, type SearchSchool,
} from '../../../components/search/searchModel'
import { addRecent, loadRecentSearches, saveRecentSearches } from '../../../components/search/recentSearches'
import { subscribeSearchSubmit, useSearchQuery } from '../../../components/search/searchQuery'
import { useTabBarScroll } from '../../../components/navigation/TabBarScrollContext'
import { getSettings } from '../../../services/settings'
import { syncOnLaunch } from '../../../services/sync'

type LoadStatus = 'loading' | 'ready' | 'error'

const listingKey = (l: SearchListing) => l.id
const schoolKey = (s: SearchSchool) => s.id
const openListing = (slug: string) => router.push(`/listings/${slug}` as never)
const openSchool = (id: string) => router.push(`/schools/${id}` as never)

function listingBadges(l: SearchListing): BadgeSpec[] {
  const soon = dateUrgency(l.deadline ?? (l.type === 'exam' ? l.examDate : null))
  const out: BadgeSpec[] = soon ? [soon] : []
  if (l.isVerified) out.push({ label: 'Verified', tone: 'neutral' })
  return out
}

/**
 * Search: one field over schools, scholarships and entrance exams, read from
 * the catalog on this device, so it answers as you type and works offline
 * once the catalog has synced.
 *
 * States: empty (recent searches + what is coming up), results grouped by
 * kind, no match, and offline (nothing synced yet and the last sync failed).
 * Every scholarship or exam result names its dates and its official site
 * when the catalog has them; nothing is shown that the data does not hold.
 */
export default function SearchScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const sync = useSyncStatus()
  const syncSettled = useSyncSettled()

  const [status, setStatus] = useState<LoadStatus>('loading')
  const [attempt, setAttempt] = useState(0)
  const [listings, setListings] = useState<SearchListing[]>([])
  const [schools, setSchools] = useState<SearchSchool[]>([])
  const [userRegion, setUserRegion] = useState('')
  // Shared with the floating bar, which hosts the field on Android phones and
  // tablets and compact web, and with the native field on iOS.
  const [query, setQuery] = useSearchQuery()
  const barHostsField = useTabBarScroll()?.barHostsSearch ?? false
  // iOS: the system search tab; the field is the native one in this tab's
  // stack header (search/_layout.ios.tsx), not one drawn on the page.
  const nativeField = Platform.OS === 'ios'
  const [recent, setRecent] = useState<string[]>([])
  const recentRef = useRef<string[]>([])
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let alive = true
    void loadRecentSearches().then(r => { if (alive) { recentRef.current = r; setRecent(r) } })
    return () => { alive = false }
  }, [])

  // Newest read wins: retry, a sync landing and a new db can overlap.
  useEffect(() => {
    let alive = true
    setStatus(prev => (prev === 'ready' ? prev : 'loading'))
    Promise.all([
      db.select({
        id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title, type: listingsTable.type,
        region: listingsTable.region, provider: listingsTable.provider, province: listingsTable.province,
        incomeCeiling: listingsTable.incomeCeiling, isVerified: listingsTable.isVerified,
        examDate: listingsTable.examDate, deadline: listingsTable.deadline, externalUrl: listingsTable.externalUrl,
      }).from(listingsTable),
      db.select({
        id: tertiarySchools.id, name: tertiarySchools.name, acronym: tertiarySchools.acronym,
        region: tertiarySchools.region, province: tertiarySchools.province,
        isSuc: tertiarySchools.isSuc, isLuc: tertiarySchools.isLuc, freeTuition: universityProfiles.freeTuition,
      }).from(tertiarySchools).leftJoin(universityProfiles, eq(tertiarySchools.id, universityProfiles.schoolId)),
      getSettings(db),
    ])
      .then(([l, s, settings]) => {
        if (!alive) return
        setListings(l as SearchListing[])
        setSchools(s as SearchSchool[])
        setUserRegion(settings.schoolRegion ?? '')
        setStatus('ready')
      })
      .catch((e: unknown) => {
        console.warn('[search] catalog load failed:', e)
        if (alive) setStatus('error')
      })
    return () => { alive = false }
  }, [db, attempt, syncSettled])

  const results = useMemo(
    () => (status === 'ready' ? searchCatalog(deferredQuery, { schools, listings }, userRegion) : EMPTY_RESULTS),
    [status, deferredQuery, schools, listings, userRegion],
  )
  const upcoming = useMemo(() => upcomingListings(listings), [listings])

  // Compute the next list outside the state updater (updaters must stay pure:
  // StrictMode runs them twice), then set it, then persist it.
  const applyRecent = useCallback((next: string[]) => {
    recentRef.current = next
    setRecent(next)
  }, [])
  const remember = useCallback((q: string) => {
    const next = addRecent(recentRef.current, q)
    if (next.join('\n') === recentRef.current.join('\n')) return
    applyRecent(next)
    void saveRecentSearches(next)
  }, [applyRecent])
  // The bar's search key records a recent, like the screen's own field.
  useEffect(() => subscribeSearchSubmit(remember), [remember])

  const clearRecent = useCallback(() => {
    applyRecent([])
    void saveRecentSearches([])
  }, [applyRecent])

  const retry = useCallback(() => {
    setStatus('loading')
    void syncOnLaunch(db).finally(() => setAttempt(a => a + 1))
  }, [db])

  const renderListing = useCallback((l: SearchListing) => (
    <ListingCard
      icon={l.type === 'exam' ? GraduationCap1Outlined : CertificateBadge1Outlined}
      title={l.title}
      meta={[l.type === 'scholarship' ? l.provider : null, listingMeta(l)].filter(Boolean).join(' · ')}
      badges={listingBadges(l)}
      onPress={() => { remember(query); openListing(l.slug) }}
      accessibilityHint={l.type === 'exam'
        ? 'Opens the exam: dates, requirements and mock practice'
        : 'Opens the scholarship: deadline, eligibility and how to apply'}
    />
  ), [remember, query])

  const renderSchool = useCallback((s: SearchSchool) => (
    <ListingCard
      icon={Buildings1Outlined}
      title={s.name}
      meta={schoolMeta(s)}
      onPress={() => { remember(query); openSchool(s.id) }}
      accessibilityHint="Opens the school: entrance exam, courses and tuition"
    />
  ), [remember, query])

  const q = query.trim()
  const catalogEmpty = status === 'ready' && listings.length === 0 && schools.length === 0
  const firstSync = catalogEmpty && sync.isSyncing
  const offline = catalogEmpty && !sync.isSyncing && sync.lastError != null

  // Screen readers hear the outcome of each search: a polite live region
  // (Android, web) and an announcement on iOS, which has no live regions.
  const total = resultCount(results)
  const searching = status === 'ready' && !offline && !firstSync && deferredQuery.trim().length >= 2
  const statusText = searching ? (total ? `${total} result${total === 1 ? '' : 's'}` : 'No matches') : ''
  useEffect(() => {
    if (statusText && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(statusText)
  }, [statusText])

  let body: React.ReactNode
  if (status === 'error') {
    body = <ErrorState title="Couldn't load search" onRetry={() => setAttempt(a => a + 1)} />
  } else if (status === 'loading' || firstSync) {
    body = <GridSkeleton label="Loading search" count={3} testID="search-skeleton" />
  } else if (offline) {
    body = (
      <View testID="search-offline">
        <EmptyState
          icon={<Lineicons icon={Globe1Outlined} size={26} color={t.textSecondary} />}
          title="You're offline"
          body="Search runs on this device once the catalog has downloaded. Connect to the internet, then try again."
          actionLabel="Try again"
          onAction={retry}
        />
      </View>
    )
  } else if (q.length < 2) {
    body = (
      <View style={{ gap: spacing.xl }} testID="search-empty">
        {recent.length > 0 ? (
          <View>
            <SectionHeader title="Recent searches" actionLabel="Clear" onAction={clearRecent} />
            {recent.map(r => (
              <ListRow
                key={r}
                title={r}
                leading={<View {...decorative}><Lineicons icon={Search1Outlined} size={18} color={t.textSecondary} /></View>}
                onPress={() => setQuery(r)}
                accessibilityLabel={`Search again for ${r}`}
              />
            ))}
          </View>
        ) : null}
        {upcoming.length > 0 ? (
          <View>
            <SectionHeader title="Coming up" subtitle="The nearest deadlines and exam dates" />
            <StaticGrid items={upcoming} keyExtractor={listingKey} renderItem={renderListing} />
          </View>
        ) : null}
        {recent.length === 0 && upcoming.length === 0 ? (
          <EmptyState
            icon={<Lineicons icon={Search1Outlined} size={26} color={t.textSecondary} />}
            title="Search the catalog"
            body="Find a school, a scholarship or an entrance exam by name, place or acronym."
          />
        ) : null}
      </View>
    )
  } else if (resultCount(results) === 0) {
    body = (
      <View testID="search-no-match">
        <EmptyState
          icon={<Lineicons icon={SearchMinusOutlined} size={26} color={t.textSecondary} />}
          title={`No matches for “${truncateQuery(q)}”`}
          body="Try fewer words, a school's acronym, or a province."
          actionLabel="Clear search"
          onAction={() => setQuery('')}
        />
      </View>
    )
  } else {
    body = (
      <View style={{ gap: spacing.xl }} testID="search-results">
        {results.scholarships.length > 0 ? (
          <View>
            <SectionHeader title="Scholarships" />
            <StaticGrid items={results.scholarships} keyExtractor={listingKey} renderItem={renderListing} />
          </View>
        ) : null}
        {results.exams.length > 0 ? (
          <View>
            <SectionHeader title="Entrance exams" />
            <StaticGrid items={results.exams} keyExtractor={listingKey} renderItem={renderListing} />
          </View>
        ) : null}
        {results.schools.length > 0 ? (
          <View>
            <SectionHeader title="Schools" />
            <StaticGrid items={results.schools} keyExtractor={schoolKey} renderItem={renderSchool} />
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <Screen
      tabBarInset
      headerScrolls
      width="wide"
      header={<TabHeader title="Search" subtitle="Schools, scholarships and entrance exams" />}
    >
      {nativeField ? (
        <NativeSearchField query={query} onChangeQuery={setQuery} onSubmit={remember} />
      ) : barHostsField ? null : (
        <View style={{ paddingBottom: spacing.lg }}>
          <SearchField
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            onSubmit={() => remember(query)}
            placeholder={PLACEHOLDER}
            accessibilityLabel="Search schools, scholarships and exams"
          />
        </View>
      )}
      <Text
        testID="search-status"
        accessibilityLiveRegion="polite"
        aria-live="polite"
        style={[textStyle('caption', t.textSecondary), statusText ? { paddingBottom: spacing.sm } : null]}
        maxFontSizeMultiplier={2}
      >
        {statusText}
      </Text>
      {body}
      {/* While typing in the bar's field, the keyboard covers the bottom of
          the page: grow the end of the list by its height so the last
          results can still scroll above it. */}
      {(barHostsField || nativeField) && Platform.OS !== 'web' ? <KeyboardSpacer /> : null}
    </Screen>
  )
}

const PLACEHOLDER = 'School, scholarship or exam, e.g. UPCAT'

/**
 * iOS: the native search field of this tab's stack header (Stack.SearchBar
 * sets headerSearchBarOptions). On iOS 26 the search tab moves it into the
 * glass bar; on iOS 18 it sits under the navigation bar. Typing drives the
 * shared query; a query set on the page (a recent search, Clear) is written
 * back into the field. Draws nothing itself.
 */
function NativeSearchField({ query, onChangeQuery, onSubmit }: {
  query: string
  onChangeQuery: (q: string) => void
  onSubmit: (q: string) => void
}) {
  const { theme: t } = useTheme()
  const ref = useRef<SearchBarCommands>(null)
  // The field's own text, so typing is not echoed back into it.
  const fieldText = useRef(query)

  useEffect(() => {
    if (query === fieldText.current) return
    fieldText.current = query
    ref.current?.setText(query)
  }, [query])

  const onChangeText = useCallback((e: { nativeEvent: { text: string } }) => {
    fieldText.current = e.nativeEvent.text
    onChangeQuery(e.nativeEvent.text)
  }, [onChangeQuery])

  return (
    <Stack.SearchBar
      ref={ref}
      placeholder={PLACEHOLDER}
      autoCapitalize="none"
      hideWhenScrolling={false}
      tintColor={t.accent}
      onChangeText={onChangeText}
      onSearchButtonPress={e => onSubmit(e.nativeEvent.text)}
      onCancelButtonPress={() => { fieldText.current = ''; onChangeQuery('') }}
    />
  )
}

/** Keyboard-height spacer (UI thread): 0 when the keyboard is closed. */
function KeyboardSpacer() {
  const { height } = useReanimatedKeyboardAnimation()
  const style = useAnimatedStyle(() => ({ height: Math.max(0, -height.value) }))
  return <Animated.View testID="search-keyboard-spacer" style={style} />
}
