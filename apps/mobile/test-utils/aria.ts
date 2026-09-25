/**
 * Read an aria-* prop as the component passed it. React Native's Pressable
 * folds aria-checked / aria-disabled / … into `accessibilityState` on its host
 * View, while react-native-web forwards the aria-* prop itself to the DOM. So
 * the web-facing contract lives on the composite, one or two levels above the
 * host element a role query returns. Walks up until the prop is found.
 */
export function aria(el: { props: Record<string, unknown>; parent: unknown } | null | undefined, key: `aria-${string}`): unknown {
  let n = el as { props: Record<string, unknown>; parent: unknown } | null | undefined
  for (let i = 0; n && i < 4; i++) {
    if (n.props && key in n.props && n.props[key] !== undefined) return n.props[key]
    n = n.parent as typeof n
  }
  return undefined
}
