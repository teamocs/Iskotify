import Head from 'expo-router/head'
import { usePathname } from 'expo-router'
import { webTitle } from '../utils/webTitle'

/** The browser-tab title of the current page. */
export function WebHead() {
  const title = webTitle(usePathname())
  return (
    <Head>
      <title>{title}</title>
      <meta property="og:title" content={title} />
    </Head>
  )
}
