'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { INITIAL_SHORTCUT_STATE, isTypingTarget, resolveShortcut } from '@/lib/nav/shortcuts'

/**
 * Global key listener for the admin console. The rules (sequences, timeout)
 * live in lib/nav/shortcuts; this only feeds keys in and performs the action.
 * Ignores keys while typing and any chord with Ctrl/Cmd/Alt, so browser and OS
 * shortcuts keep working.
 */
export function KeyboardShortcuts({ onShowHelp }: { onShowHelp: () => void }) {
  const router = useRouter()
  const state = useRef(INITIAL_SHORTCUT_STATE)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target as HTMLElement | null)) return
      // An open modal owns the keyboard. (The closed mobile nav stays mounted
      // but inert, so it doesn't count.)
      const modals = Array.from(document.querySelectorAll('[aria-modal="true"]'))
      if (modals.some(m => !m.closest('[inert]'))) return

      const { state: next, action } = resolveShortcut(state.current, e.key, Date.now())
      state.current = next
      if (!action) return
      if (action.type === 'focus-search') {
        // Only claim "/" when the page has a search box; otherwise leave it to
        // the browser (Firefox quick find).
        const search = document.querySelector<HTMLInputElement>('[data-shortcut-search]')
        if (!search) return
        e.preventDefault()
        search.focus()
        search.select()
        return
      }
      e.preventDefault()
      if (action.type === 'navigate') router.push(action.href)
      else onShowHelp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, onShowHelp])

  return null
}
