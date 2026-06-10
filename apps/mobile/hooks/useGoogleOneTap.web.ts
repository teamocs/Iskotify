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
 *
 * Security: a per-session random nonce is generated on each hook mount.
 * The SHA-256 hash of the nonce is passed to google.accounts.id.initialize
 * (so Google embeds it in the ID token), and the raw nonce is passed to
 * supabase.auth.signInWithIdToken for server-side verification. This prevents
 * ID token replay attacks.
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
            nonce?: string
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

/** Generate a cryptographically random base64url nonce. */
function generateNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  // base64url-encode: replace + → -, / → _, strip trailing =
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Return the SHA-256 digest of a string as a lowercase hex string. */
async function sha256Hex(plain: string): Promise<string> {
  const encoded = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useGoogleOneTap(): void {
  useEffect(() => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    if (!clientId) return  // env unset — One Tap absent, no error

    let cancelled = false

    // Generate a fresh nonce for this hook mount. The raw nonce is kept in
    // closure scope; only the SHA-256 hash goes to Google.
    const rawNonce = generateNonce()

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
        script.onload = () => void activate()
        document.head.appendChild(script)
      } else if (window.google?.accounts?.id) {
        void activate()
      }
    }

    async function activate() {
      if (cancelled || !window.google?.accounts?.id) return

      // Hash the nonce so Google can embed it in the ID token JWT.
      const hashedNonce = await sha256Hex(rawNonce)

      window.google.accounts.id.initialize({
        client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
        nonce: hashedNonce,
        callback: async (response) => {
          if (!response.credential) return
          // Pass both the ID token and the raw nonce so Supabase can verify
          // that the nonce in the token matches.
          const result = await signInWithGoogleIdToken(response.credential, rawNonce)
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
