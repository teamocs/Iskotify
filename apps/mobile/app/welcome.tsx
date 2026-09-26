import { Redirect } from 'expo-router'

/**
 * /welcome was the one-screen summary shown after onboarding. The guided tour
 * (app/tour.tsx) replaced it; this route stays so an in-flight navigation or
 * an old link still lands on the tour instead of a 404.
 */
export default function WelcomeScreen() {
  return <Redirect href="/tour?from=onboarding" />
}
