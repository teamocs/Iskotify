import { createContext, useContext } from 'react'
import * as SafeArea from 'react-native-safe-area-context'

type Insets = { top: number; bottom: number; left: number; right: number }
const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * The library's insets context. Jest module mocks of react-native-safe-area-context
 * often omit it, so fall back to an empty context of the same shape. Resolved once
 * at module load, so the hook below makes exactly one, unconditional hook call.
 */
const InsetsContext: React.Context<Insets | null> =
  (SafeArea as { SafeAreaInsetsContext?: React.Context<Insets | null> }).SafeAreaInsetsContext ??
  createContext<Insets | null>(null)

/**
 * Safe-area insets that never throw. `useSafeAreaInsets()` throws outside a
 * <SafeAreaProvider> (isolated component renders, some web previews); UI
 * primitives read the context directly and fall back to zero insets.
 */
export function useSafeInsets(): Insets {
  return useContext(InsetsContext) ?? ZERO
}
