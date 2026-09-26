import { useState, useEffect } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { listings as listingsTable, tertiarySchools } from '../../../db/schema'
import { listPublishedBlueprintSlugs } from '../../../services/examBlueprints'
import { isSchoolFocusSlug, schoolIdFromFocusSlug } from '../../../utils/focusSlug'
import { SessionChooser } from '../../../components/practice/SessionChooser'
import { SessionLoading } from '../../../components/practice/SessionStates'
import { useTheme } from '../../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Book1Outlined, StopwatchOutlined } from '@lineiconshq/free-icons'

// ── Screen: the exam "chooser" ──────────────────────────────────────────────────
// Landing screen after tapping a "My Focus" exam/scholarship card. Lets the user
// choose between a subject/topic review and a timed mock exam (when one is authored).

export default function PracticeStartScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t } = useTheme()

  const [listingTitle, setListingTitle] = useState('')
  const [mockAvailable, setMockAvailable] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // A school-level focus ("school:<id>") has no content of its own — its mock +
  // review resolve to the general entrance practice, but we still show the
  // school's name as the title.
  const isSchool = isSchoolFocusSlug(slug)
  const contentSlug = isSchool ? 'general-cet' : slug


  useEffect(() => {
    let alive = true
    void (async () => {
      const [titleRows, slugs] = await Promise.all([
        isSchool
          ? db.select({ title: tertiarySchools.name }).from(tertiarySchools).where(eq(tertiarySchools.id, schoolIdFromFocusSlug(slug))).limit(1)
          : db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        listPublishedBlueprintSlugs(db),
      ])
      if (!alive) return
      setListingTitle(titleRows[0]?.title ?? slug)
      setMockAvailable(slugs.includes(contentSlug))
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [db, slug, isSchool, contentSlug])

  if (!loaded) return <SessionLoading label="Loading practice options" />

  const review = {
    key: 'review', title: 'Take a review', subtitle: 'Study by subject and topic, at your own pace',
    icon: <Lineicons icon={Book1Outlined} size={24} color={t.accentText} />,
    onPress: () => router.push(`/practice/review/${contentSlug}`),
  }
  const mock = {
    key: 'mock', title: 'Take a mock exam', subtitle: 'Timed, full exam simulation',
    icon: <Lineicons icon={StopwatchOutlined} size={24} color={t.accentText} />,
    onPress: () => router.push(`/practice/exam/${contentSlug}`),
  }

  return (
    <SessionChooser
      title={listingTitle}
      lead="Choose how you want to prepare"
      fallbackHref="/practice"
      recommended={mockAvailable ? { ...mock, actionLabel: 'Start mock exam' } : { ...review, actionLabel: 'Start review' }}
      options={mockAvailable ? [{ ...review, icon: <Lineicons icon={Book1Outlined} size={20} color={t.textSecondary} /> }] : []}
      optionsTitle="Or study by topic"
      note={mockAvailable ? undefined : { title: 'Mock exam coming soon', body: 'A timed mock for this listing is on the way. Topic reviews are ready now.' }}
    />
  )
}
