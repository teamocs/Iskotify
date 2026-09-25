import { useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Bookmark1Outlined, Bell1Outlined, Pencil1Outlined, ArrowAngularTopRightOutlined,
  GraduationCap1Outlined, HourglassOutlined, FileQuestionOutlined, CheckCircle1Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { listings as listingsTable, resultWatches } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { RequirementsChecklist } from '../../components/RequirementsChecklist'
import { SuggestDateCorrectionModal } from '../../components/SuggestDateCorrectionModal'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { Disclosure } from '../../components/explore/Disclosure'
import { LinkRow } from '../../components/explore/LinkRow'
import { externalLinkProps } from '../../components/explore/externalLink'
import { daysUntilDate, fmtLongDate, matchBadge } from '../../components/explore/exploreModel'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { getSettings } from '../../services/settings'
import { listPublishedBlueprintSlugs } from '../../services/examBlueprints'
import { matchScholarship, scholarshipProfileIncomplete } from '../../utils/scholarshipMatch'
import type { MatchResult, StudentProfile } from '../../utils/scholarshipMatch'

interface FullListing {
  id: string
  slug: string
  title: string
  type: string
  status: string
  examDate: number | null
  deadline: number | null
  region: string
  description: string
  requirements: string
  coverage: string
  provider: string
  externalUrl: string
  grantAmount: string
  resultsDate: number | null
  // scholarship-specific
  province: string | null
  city: string | null
  scope: string
  isVerified: boolean
  incomeCeiling: number | null
  gwaRequirement: number | null
  monthlyStipend: number | null
  serviceObligationYears: number | null
  hasEntranceExam: boolean
  applicationWindow: string | null
  scholarshipMeta: string
}

type Status = 'loading' | 'ready' | 'missing' | 'error'

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return (JSON.parse(raw ?? '') as T) ?? fallback } catch { return fallback }
}

function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH')}`
}

function preview(text: string, max = 60): string {
  const flat = text.replace(/\n/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

// ── Small local pieces ────────────────────────────────────────────────────────

/** Label/value line inside the key-facts panel and detail disclosures. */
function FactRow({ label, value }: { label: string; value: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.xs }}>
      <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>{label}</Text>
      <Text style={[textStyle('label', t.textPrimary), { textAlign: 'right', flexShrink: 1 }]} maxFontSizeMultiplier={1.6}>{value}</Text>
    </View>
  )
}

/** A reason line with a drawn dot, not a "•" glyph. */
function Bullet({ children, color }: { children: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <View {...decorative} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, marginTop: 8 }} />
      <Text style={[textStyle('bodySm', color), { flex: 1 }]} maxFontSizeMultiplier={1.6}>{children}</Text>
    </View>
  )
}

/**
 * The page's one maroon action when it leaves the app (apply on the official
 * site). Mirrors Button's primary variant, but as a link: a real <a href> on
 * web (the shared Button always announces as a button).
 */
function PrimaryLinkButton({ label, url }: { label: string; url: string }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      {...externalLinkProps(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
            paddingHorizontal: spacing.xl, borderRadius: radius.lg, borderCurve: 'continuous',
            backgroundColor: pressed ? t.accentPressed : t.accent,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Text style={textStyle('button', t.textInverse)} maxFontSizeMultiplier={2}>{label}</Text>
      <View {...decorative}>
        <Lineicons icon={ArrowAngularTopRightOutlined} size={16} color={t.textInverse} />
      </View>
    </Pressable>
  )
}

function DetailSkeleton() {
  return (
    <View testID="listing-skeleton" accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ gap: spacing.lg, paddingTop: spacing.md }}>
      <Skeleton width={96} height={20} radius={radius.pill} />
      <Skeleton width="80%" height={28} />
      <Skeleton width="50%" height={14} />
      <Skeleton height={160} radius={radius.xl} />
      <Skeleton height={48} radius={radius.lg} />
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ListingDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const twoUp = columnCount(useBreakpoint()) === 2
  const [listing, setListing] = useState<FullListing | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const [acquiredCount, setAcquiredCount] = useState(0)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [reasonsOpen, setReasonsOpen] = useState(false)
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [watchingResults, setWatchingResults] = useState(false)
  const [hasBlueprint, setHasBlueprint] = useState(false)
  const [showDateCorrection, setShowDateCorrection] = useState(false)
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()
  const inFocus = isInFocus(slug)
  const focusPriority = getPriority(slug)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    void (async () => {
      try {
        const [listingRows, watchRows, settings] = await Promise.all([
          db.select().from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
          db.select({ slug: resultWatches.slug }).from(resultWatches).where(eq(resultWatches.slug, slug)).limit(1),
          getSettings(db),
        ])
        if (!alive) return
        const l = (listingRows[0] ?? null) as FullListing | null
        setListing(l)
        setWatchingResults(watchRows.length > 0)

        if (l && l.type === 'scholarship') {
          setProfileIncomplete(scholarshipProfileIncomplete({
            gwa: settings.gwa ?? null, province: settings.province ?? null, incomeBracket: settings.incomeBracket ?? null,
          }))
          const meta = parseJson<Record<string, unknown>>(l.scholarshipMeta, {})
          const studentProfile: StudentProfile = {
            gradeLevel: settings.gradeLevel ?? undefined,
            incomeBracket: settings.incomeBracket ?? undefined,
            gwa: settings.gwa ?? undefined,
            province: settings.province ?? null,
            city: settings.city ?? null,
          }
          setMatchResult(matchScholarship({
            scope: (l.scope ?? 'national') as 'national' | 'regional' | 'provincial' | 'city' | 'school',
            isVerified: l.isVerified ?? false,
            incomeCeiling: l.incomeCeiling ?? null,
            gwaRequirement: l.gwaRequirement ?? null,
            serviceObligationYears: l.serviceObligationYears ?? null,
            province: l.province ?? null,
            city: l.city ?? null,
            targetYearLevels: Array.isArray(meta.target_year_levels) ? (meta.target_year_levels as unknown[]).map(String) : [],
            hucExcluded: !!meta.huc_excluded,
          }, studentProfile))
        }
        setStatus(l ? 'ready' : 'missing')

        // Non-blocking: does this exam have a published mock blueprint?
        listPublishedBlueprintSlugs(db)
          .then(slugs => { if (alive) setHasBlueprint(slugs.includes(slug)) })
          .catch(() => { /* the mock CTA simply won't appear */ })
      } catch (e) {
        console.warn('[listing] load failed:', e)
        if (alive) setStatus('error')
      }
    })()
    return () => { alive = false }
  }, [db, slug, attempt])

  const toggleResultWatch = useCallback(async () => {
    if (!listing) return
    if (watchingResults) {
      await db.delete(resultWatches).where(eq(resultWatches.slug, listing.slug))
      setWatchingResults(false)
    } else {
      await db.insert(resultWatches).values({ slug: listing.slug, addedAt: Date.now() }).onConflictDoNothing()
      setWatchingResults(true)
    }
  }, [db, listing, watchingResults])

  const isScholarship = listing?.type === 'scholarship'
  const fallbackHref = isScholarship ? '/explore?section=scholarships' : '/explore?section=universities'

  // ── Non-ready states ────────────────────────────────────────────────────────

  if (status !== 'ready' || !listing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <DetailTopBar fallbackHref={fallbackHref} />
        <ScreenScroll tabBarInset={false}>
          {status === 'loading' ? <DetailSkeleton /> : status === 'error' ? (
            <ErrorState title="Couldn't load this listing" onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <EmptyState
              icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
              title="We couldn't find this listing"
              body="It may have been removed or renamed since your last sync."
              actionLabel="Back to Explore"
              onAction={() => router.replace('/explore')}
            />
          )}
        </ScreenScroll>
      </SafeAreaView>
    )
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const isExam = listing.type === 'exam'
  const keyDate = isExam ? (listing.examDate ?? listing.deadline) : (listing.deadline ?? listing.examDate)
  const daysLeft = daysUntilDate(keyDate)
  const requirements = parseJson<unknown[]>(listing.requirements, []).map(String)
  const meta = isScholarship ? parseJson<Record<string, unknown>>(listing.scholarshipMeta, {}) : {}
  const otherBenefits: string[] = Array.isArray(meta.other_benefits) ? (meta.other_benefits as unknown[]).map(String) : []
  const hasBenefits = !!(listing.coverage || listing.grantAmount || otherBenefits.length > 0)
  const match = matchResult ? matchBadge(matchResult.status) : null
  const extraReasons = matchResult ? [...matchResult.reasons.slice(2)] : []
  const warnings = matchResult?.warnings ?? []
  const obligation = listing.serviceObligationYears ?? 0

  const benefitsPreview = listing.grantAmount ? `₱${listing.grantAmount} grant`
    : listing.monthlyStipend != null ? `${peso(listing.monthlyStipend)} monthly stipend`
    : otherBenefits[0] ?? preview(listing.coverage)

  const countdownLabel = isExam ? 'days until the exam' : 'days left to apply'
  const dateLabel = isExam ? 'Exam date' : 'Application deadline'

  // ── Blocks ──────────────────────────────────────────────────────────────────

  const hero = (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        <Badge label={isExam ? 'Entrance exam' : 'Scholarship'} tone="neutral" />
        {listing.status && listing.status !== 'active' ? (
          <Badge label={listing.status.charAt(0).toUpperCase() + listing.status.slice(1)} tone="warning" />
        ) : null}
      </View>
      <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>
        {listing.title}
      </Text>
      {listing.provider || listing.region ? (
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          {[listing.provider, listing.region].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  )

  // 1. Deadline first, 2. eligibility — the two facts a student decides on.
  const keyFacts = (
    <Card testID="listing-key-facts" style={{ gap: spacing.md }}>
      {daysLeft != null && daysLeft >= 0 ? (
        <View
          accessible
          accessibilityLabel={daysLeft === 0 ? `${isExam ? 'Exam' : 'Deadline'} is today` : `${daysLeft} ${countdownLabel}`}
          style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}
        >
          <Text style={textStyle('numericLg', daysLeft <= 7 ? t.warning : t.textPrimary)} maxFontSizeMultiplier={1.3}>
            {daysLeft === 0 ? 'Today' : String(daysLeft)}
          </Text>
          {daysLeft === 0 ? null : (
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>{countdownLabel}</Text>
          )}
        </View>
      ) : daysLeft != null ? (
        <Badge label={isExam ? 'This exam date has passed' : 'The deadline has passed'} tone="neutral" />
      ) : null}

      <View>
        {keyDate ? <FactRow label={dateLabel} value={fmtLongDate(keyDate)} /> : null}
        {isExam && listing.deadline && listing.examDate ? (
          <FactRow label="Application deadline" value={fmtLongDate(listing.deadline)} />
        ) : null}
        {listing.resultsDate ? <FactRow label="Results expected" value={fmtLongDate(listing.resultsDate)} /> : null}
        {!keyDate ? (
          <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>Dates to be announced.</Text>
        ) : null}
      </View>
      <Button
        label="Suggest a date correction"
        variant="ghost"
        size="sm"
        icon={<Lineicons icon={Pencil1Outlined} size={14} color={t.accentText} />}
        onPress={() => setShowDateCorrection(true)}
        style={{ marginLeft: -spacing.lg }}
      />

      <View style={{ height: 1, backgroundColor: t.divider }} />

      <View style={{ gap: spacing.sm }}>
        <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>Eligibility</Text>
        {isScholarship ? (
          match && matchResult && !profileIncomplete ? (
            <View style={{ gap: spacing.sm }}>
              <Badge label={match.label} tone={match.tone} />
              {matchResult.reasons.slice(0, 2).map(r => <Bullet key={r} color={t.textSecondary}>{r}</Bullet>)}
              {reasonsOpen ? (
                <>
                  {extraReasons.map(r => <Bullet key={r} color={t.textSecondary}>{r}</Bullet>)}
                  {warnings.map(w => <Bullet key={w} color={t.warning}>{w}</Bullet>)}
                </>
              ) : null}
              {extraReasons.length + warnings.length > 0 ? (
                <Button
                  label={reasonsOpen ? 'Show fewer reasons' : `Show ${extraReasons.length + warnings.length} more`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setReasonsOpen(v => !v)}
                  style={{ marginLeft: -spacing.lg }}
                />
              ) : null}
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                Add your GWA, family income and province to see if you qualify.
              </Text>
              <Button label="Complete profile" variant="secondary" size="sm" onPress={() => router.push('/profile/scholarship-info')} />
            </View>
          )
        ) : (
          <View>
            <FactRow label="Open to" value={listing.region || 'Students nationwide'} />
            {listing.provider ? <FactRow label="Given by" value={listing.provider} /> : null}
          </View>
        )}
        {isScholarship && obligation > 0 ? (
          <View
            style={{
              flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
              padding: spacing.md, borderRadius: radius.sm, backgroundColor: t.warningSurface,
            }}
          >
            <View {...decorative} style={{ marginTop: 2 }}>
              <Lineicons icon={HourglassOutlined} size={16} color={t.warningStrong} />
            </View>
            <Text style={[textStyle('bodySm', t.warningStrong), { flex: 1 }]} maxFontSizeMultiplier={1.6}>
              Requires {obligation} year{obligation === 1 ? '' : 's'} of service after graduation.
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  )

  // 3. One primary action, then the save action (Focus).
  const primary = isExam ? (
    hasBlueprint ? (
      <Button
        label="Take a mock exam"
        size="lg"
        fullWidth={!twoUp}
        icon={<Lineicons icon={GraduationCap1Outlined} size={18} color={t.textInverse} />}
        onPress={() => router.push(`/practice/exam/${slug}`)}
      />
    ) : (
      <Button label="Practise for this exam" size="lg" fullWidth={!twoUp} onPress={() => router.push('/(tabs)/practice')} />
    )
  ) : listing.externalUrl ? (
    <PrimaryLinkButton label="Apply on the official site" url={listing.externalUrl} />
  ) : null

  const actions = (
    <View testID="listing-actions" style={{ gap: spacing.sm }}>
      {primary}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          label={inFocus ? `In Focus #${focusPriority}` : 'Add to Focus'}
          accessibilityLabel={inFocus ? `In Focus #${focusPriority}. Remove from Focus` : 'Add to Focus'}
          accessibilityHint={inFocus ? undefined : 'Pins it to Today with a countdown'}
          variant="secondary"
          icon={<Lineicons icon={inFocus ? CheckCircle1Outlined : Bookmark1Outlined} size={16} color={t.accentText} />}
          onPress={() => (inFocus ? removeListing(slug) : addListing(slug))}
        />
        {isExam ? (
          <Button
            label={watchingResults ? 'Watching results' : 'Watch results'}
            accessibilityHint={watchingResults ? 'Stops tracking this exam in the Results Tracker' : 'Adds this exam to the Results Tracker'}
            variant="ghost"
            icon={<Lineicons icon={Bell1Outlined} size={16} color={t.accentText} />}
            onPress={() => { void toggleResultWatch() }}
          />
        ) : null}
      </View>
    </View>
  )

  const requirementsBlock = requirements.length > 0 ? (
    <View>
      <SectionHeader title={`Requirements (${acquiredCount}/${requirements.length})`} subtitle="Tick each document as you get it" />
      <RequirementsChecklist listingSlug={slug} requirements={requirements} onAcquiredCountChange={setAcquiredCount} />
    </View>
  ) : null

  const details = (
    <View>
      {listing.description ? (
        <Disclosure title="About" preview={preview(listing.description)}>
          <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>{listing.description}</Text>
        </Disclosure>
      ) : null}

      {isScholarship ? (
        <Disclosure
          title="Scholarship details"
          preview={[
            listing.incomeCeiling != null ? `Income up to ${peso(listing.incomeCeiling)}/yr` : null,
            listing.gwaRequirement != null ? `GWA ${listing.gwaRequirement}` : null,
          ].filter(Boolean).join(' · ')}
        >
          <View style={{ gap: spacing.sm }}>
            <View>
              {listing.incomeCeiling != null ? <FactRow label="Income ceiling" value={`${peso(listing.incomeCeiling)} a year`} /> : null}
              {listing.gwaRequirement != null ? <FactRow label="Minimum GWA" value={`${listing.gwaRequirement}%`} /> : null}
              {listing.monthlyStipend != null ? <FactRow label="Monthly stipend" value={peso(listing.monthlyStipend)} /> : null}
              {listing.applicationWindow ? <FactRow label="Application window" value={listing.applicationWindow} /> : null}
            </View>
            {listing.scope || listing.province || listing.city ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {listing.scope ? <Chip label={listing.scope.charAt(0).toUpperCase() + listing.scope.slice(1)} /> : null}
                {listing.province ? <Chip label={listing.province} /> : null}
                {listing.city ? <Chip label={listing.city} /> : null}
              </View>
            ) : null}
          </View>
        </Disclosure>
      ) : null}

      {hasBenefits ? (
        <Disclosure title={isExam ? 'Coverage' : 'Benefits'} preview={benefitsPreview}>
          <View style={{ gap: spacing.sm }}>
            {listing.grantAmount ? <FactRow label="Grant amount" value={`₱${listing.grantAmount}`} /> : null}
            {listing.coverage ? (
              <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>{listing.coverage}</Text>
            ) : null}
            {otherBenefits.map(b => <Bullet key={b} color={t.textSecondary}>{b}</Bullet>)}
          </View>
        </Disclosure>
      ) : null}

      <View style={{ borderTopWidth: 1, borderTopColor: t.divider, paddingTop: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
          <Badge label={listing.isVerified ? 'Verified' : 'Unverified'} tone={listing.isVerified ? 'success' : 'neutral'} />
          <Text style={[textStyle('caption', t.textSecondary), { flex: 1, minWidth: 180 }]} maxFontSizeMultiplier={1.6}>
            Details change every year. Check the official site before you apply.
          </Text>
        </View>
        {listing.externalUrl && isExam ? (
          <LinkRow label="Official website" url={listing.externalUrl} />
        ) : null}
      </View>
    </View>
  )

  const main = (
    <View style={{ gap: spacing.xl }}>
      {hero}
      {keyFacts}
      {actions}
      {requirementsBlock}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <DetailTopBar fallbackHref={fallbackHref} />
      <ScreenScroll tabBarInset={false} contentContainerStyle={{ paddingTop: spacing.sm }}>
        {twoUp ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl }}>
            <View style={{ flex: 3, minWidth: 0 }}>{main}</View>
            <View style={{ flex: 2, minWidth: 0 }}>{details}</View>
          </View>
        ) : (
          <View style={{ gap: spacing.xl }}>
            {main}
            {details}
          </View>
        )}
      </ScreenScroll>

      <SuggestDateCorrectionModal
        visible={showDateCorrection}
        onClose={() => setShowDateCorrection(false)}
        listingSlug={slug}
      />
    </SafeAreaView>
  )
}
