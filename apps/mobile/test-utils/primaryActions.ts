import { screen, type render } from '@testing-library/react-native'
import { Button } from '../components/ui/Button'
import { PressableScale } from '../components/ui/Pressable'
import { lightTheme } from '../theme/tokens'

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

/**
 * The visible primaries' spoken names (iOS redesign P4): a button filled
 * maroon, or a control marked testID="primary-action" (the Practice tab's
 * white "Begin" on the maroon mock hero). Names make a failure readable.
 */
export function primaryActions(): string[] {
  const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity as 1).filter(Boolean) as object[])
  const names: string[] = []
  for (const btn of screen.queryAllByRole('button')) {
    const s = flat(btn.props.style) as { backgroundColor?: string }
    if (btn.props.testID === 'primary-action' || s.backgroundColor === lightTheme.accent) {
      names.push(String(btn.props.accessibilityLabel ?? ''))
    }
  }
  return names
}
