import { useEffect, useState } from 'react'
import { Redirect, type Href } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'

const TOUR: Href = '/tour?from=onboarding'
const TODAY: Href = '/(tabs)'

/**
 * /welcome was the one-screen summary shown after onboarding. The guided tour
 * (app/tour.tsx) replaced it; this route stays so an in-flight navigation or
 * an old link still lands somewhere sensible instead of a 404: the tour the
 * first time, Today once the tour has been seen (it never auto-opens twice).
 * Renders nothing until the setting is read, so it never flashes the tour.
 */
export default function WelcomeScreen() {
  const db = useDb()
  const [href, setHref] = useState<Href | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      let next = TOUR
      try {
        const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        if (Number(rows[0]?.tourSeenAt ?? 0) > 0) next = TODAY
      } catch (e) {
        console.warn('[welcome] tour state:', e)
      }
      if (alive) setHref(next)
    })()
    return () => { alive = false }
  }, [db])

  return href ? <Redirect href={href} /> : null
}
