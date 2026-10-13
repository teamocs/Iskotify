import type { render } from '@testing-library/react-native'
import { Button } from '../components/ui/Button'
import { PressableScale } from '../components/ui/Pressable'

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root']

function insideButton(n: ReactTestInstance): boolean {
  for (let p = n.parent; p; p = p.parent) if (p.type === Button) return true
  return false
}

/**
 * The primary (maroon) actions on screen: every <Button> in the primary
 * variant (the default), plus any other control marked testID="primary-action"
 * (a primary that is a link, e.g. "Apply on the official site"). DESIGN.md
 * direction C allows one per screen.
 */
export function countPrimaryActions(root: ReactTestInstance): number {
  const buttons = root.findAll((n: ReactTestInstance) => n.type === Button && ((n.props as { variant?: string }).variant ?? 'primary') === 'primary')
  const links = root.findAll((n: ReactTestInstance) => n.type === PressableScale && (n.props as { testID?: string }).testID === 'primary-action' && !insideButton(n))
  return buttons.length + links.length
}
