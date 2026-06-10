/**
 * app/+html.tsx — Expo Router web HTML shell.
 *
 * This file is web-only: it injects global <head> metadata and a <style>
 * block that sets baseline behaviour for the dark-themed web build.
 *
 * Notes:
 * - React <ViewTransition> is intentionally omitted — it requires React canary
 *   (experimental builds) and is out of scope for this release.
 * - sql.js (our web data layer) does NOT require COOP/COEP headers, so no
 *   Cross-Origin-* headers are set here.
 * - All RN StyleSheet-based transitions work natively via react-native-web
 *   CSS transforms; we only patch the platform layer here, not per-component.
 */
import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
         * Disable body scroll rubber-banding and reset default styles so
         * react-native-web can own the full viewport.
         */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: WEB_STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

/**
 * Global web-only CSS injected into the <head>.
 *
 * Rules:
 *  1. color-scheme: dark — tells the browser this is a dark-themed app so
 *     native form controls, scroll bars, and system UI match the theme.
 *  2. Font-smoothing antialiased — prevents sub-pixel rendering on macOS/Linux
 *     which looks blurry on dark backgrounds.
 *  3. overscroll-behavior-y: none — prevents the iOS/Android-style pull-to-
 *     refresh bounce on desktop browsers (the app manages its own scroll UX).
 *  4. prefers-reduced-motion — respects the OS accessibility setting; collapses
 *     all CSS animations and transitions to near-zero duration for users who
 *     have asked for reduced motion. react-native-web Animated calls still run
 *     JS-side but are visually instant, which is acceptable.
 */
const WEB_STYLES = `
  html {
    color-scheme: dark;
  }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior-y: none;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`
