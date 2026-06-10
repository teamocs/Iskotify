/**
 * useGoogleOneTap.web.ts — Google One Tap via GIS script (web only).
 *
 * If EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set and no Supabase session exists,
 * this hook injects the Google Identity Services script, initializes One Tap,
 * and prompts. On a successful credential callback it calls
 * signInWithGoogleIdToken which triggers supabase.auth.onAuthStateChange,
 * which the _layout web gate listens to and re-routes accordingly.
 *
 * Graceful degradation: env var unset → no-op (One Tap simply absent; user
 * still has the "Continue with Google" button + email/password).
 */
import { useEffect } from 'react'
import { signInWithGoogleIdToken } from '../services/webAuth'
import { supabase } from '../services/supabase'

// Minimal type for the Google Identity Services API injected by the GIS script.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          prompt: () => void
          cancel: () => void
        }
      }
    }
    onGoogleOneTapLoad?: () => void
  }
}

const GIS_SCRIPT_ID = 'gis-one-tap-script'

export function useGoogleOneTap(): void {
  useEffect(() => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    if (!clientId) return  // env unset — One Tap absent, no error

    let cancelled = false

    async function init() {
      // Skip if there's already an active session
      const { data: { session } } = await supabase.auth.getSession()
      if (session || cancelled) return

      // Inject GIS script only once
      if (!document.getElementById(GIS_SCRIPT_ID)) {
        const script = document.createElement('script')
        script.id = GIS_SCRIPT_ID
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = activate
        document.head.appendChild(script)
      } else if (window.google?.accounts?.id) {
        activate()
      }
    }

    function activate() {
      if (cancelled || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
        callback: async (response) => {
          if (!response.credential) return
          const result = await signInWithGoogleIdToken(response.credential)
          if (!result.ok) {
            console.warn('[OneTap] signInWithGoogleIdToken failed:', result.error)
          }
          // On success, supabase.auth.onAuthStateChange fires and _layout re-routes.
        },
      })
      window.google.accounts.id.prompt()
    }

    void init()

    return () => {
      cancelled = true
      // Cancel the One Tap UI if it was shown
      try {
        window.google?.accounts?.id?.cancel()
      } catch {
        // ignore — GIS not loaded yet
      }
    }
  }, [])
}
