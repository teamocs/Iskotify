import { Linking, Platform } from 'react-native'

const WEB_HREF_ATTRS = { target: '_blank', rel: 'noopener noreferrer' } as const

export interface ExternalLinkProps {
  onPress?: () => void
  /** react-native-web renders a View/Pressable with `href` as a real <a>. */
  href?: string
  hrefAttrs?: typeof WEB_HREF_ATTRS
}

/**
 * Props that make a Pressable an outbound link. On web it becomes a real
 * anchor (new tab, no opener), so middle-click, "copy link address" and the
 * screen reader's links list work, and the browser follows it itself. Native
 * has no anchors: open the URL through Linking.
 */
export function externalLinkProps(url: string): ExternalLinkProps {
  if (Platform.OS === 'web') return { href: url, hrefAttrs: WEB_HREF_ATTRS }
  return { onPress: () => { void Linking.openURL(url) } }
}
