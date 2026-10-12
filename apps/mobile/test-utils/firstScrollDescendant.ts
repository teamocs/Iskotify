import type { render } from '@testing-library/react-native'

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root']

type Node = ReactTestInstance | string

const isHost = (n: ReactTestInstance) => typeof n.type === 'string'

/** The first host element under `n` (composites are looked through). */
function firstHostChild(n: ReactTestInstance): ReactTestInstance | undefined {
  for (const c of n.children as Node[]) {
    if (typeof c === 'string') continue
    if (isHost(c)) return c
    const h = firstHostChild(c)
    if (h) return h
  }
  return undefined
}

/**
 * The scroll view iOS native tabs track, found the way react-native-screens
 * does (RNSScrollViewFinder.findScrollViewInFirstDescendantChainFrom): from
 * the screen's root, keep taking the FIRST child until a scroll view, or
 * null when the chain ends first. The tab bar minimizes on scroll (and the
 * scroll view gets the bar's content inset) only for this scroll view.
 */
export function firstScrollDescendant(root: ReactTestInstance): ReactTestInstance | null {
  let node = isHost(root) ? root : firstHostChild(root)
  while (node) {
    if (node.type === 'RCTScrollView') return node
    node = firstHostChild(node)
  }
  return null
}
