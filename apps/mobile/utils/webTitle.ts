// Browser-tab title for a path (web). Detail pages get their kind, not their name:
// the name is not known until the local database answers.
const EXACT: Record<string, string> = {
  '/': 'Today', '/explore': 'Explore', '/practice': 'Practice', '/progress': 'Progress', '/search': 'Search',
  '/profile': 'Profile', '/profile/scholarship-info': 'Scholarship profile', '/settings': 'Settings',
  '/settings/report-bug': 'Report a bug', '/settings/leave-feedback': 'Leave feedback',
  '/requirements': 'Requirements', '/results-tracker': 'Results tracker', '/help': 'Help and support',
  '/about': 'About', '/terms': 'Terms of service', '/privacy': 'Privacy policy', '/upgrade': 'Full Access',
  '/mock-checkout': 'Test checkout', '/estimator': 'Estimated Admission Score', '/estimator/grades': 'Your grades',
  '/estimator/gwa': 'GWA calculator', '/schools': 'Schools directory', '/schools/course': 'Top universities by course',
  '/notes': 'Notes', '/notes/archive': 'Archived notes', '/notes/trash': 'Trash', '/notes/labels': 'Note labels',
  '/practice/exam': 'Mock exams', '/practice/mistakes': 'Mistakes', '/practice/due': 'Cards due',
  '/practice/diagnostic': 'Diagnostic', '/auth/sign-in': 'Sign in', '/auth/reset-password': 'Reset password',
  '/onboarding': 'Get started', '/tour': 'Tour', '/try': 'Free diagnostic',
}
const PREFIX: [string, string][] = [
  ['/listings/', 'Exam or scholarship'], ['/schools/course/', 'Top universities by course'], ['/schools/', 'School'],
  ['/career/', 'Career'], ['/notes/', 'Note'], ['/subjects/', 'Subject'],
  ['/practice/exam/', 'Mock exam'], ['/practice/upcat/', 'UPCAT practice'], ['/practice/start/', 'Practice'],
  ['/practice/review/', 'Review'], ['/practice/', 'Practice'],
]

export const WEB_DESCRIPTION =
  'Practice for UPCAT and other college entrance tests, with scholarships, schools and deadlines for Filipino students.'

export function webTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const name = EXACT[path] ?? PREFIX.find(([p]) => path.startsWith(p))?.[1]
  return name ? `${name} · Iskotify` : 'Iskotify'
}
