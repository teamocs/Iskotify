import { useContext } from 'react'
import * as SafeArea from 'react-native-safe-area-context'

type Insets = { top: number; bottom: number; left: number; right: number }
const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * Safe-area insets that never throw. `useSafeAreaInsets()` throws outside a
 * <SafeAreaProvider> (isolated component renders, some web previews); UI
 * primitives read the context directly and fall back to zero insets.
 *
 * The branch is decided by what the module exports, which is fixed for the
 * lifetime of the bundle, so hook order is stable.
 */
export function useSafeInsets(): Insets {
  const ctx = (SafeArea as { SafeAreaInsetsContext?: React.Context<Insets | null> }).SafeAreaInsetsContext
  if (ctx) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(ctx) ?? ZERO
  }
  const hook = (SafeArea as { useSafeAreaInsets?: () => Insets }).useSafeAreaInsets
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return hook ? hook() : ZERO
}
