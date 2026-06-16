// Shared outbound links for the marketing landing page.
//
// Both values fall back to a hardcoded default so the landing buttons ALWAYS
// render and work, even if the Vercel project has no env vars set. Set the env
// vars to override (NEXT_PUBLIC_* are inlined at build time).
//
//   NEXT_PUBLIC_WEB_APP_URL     → the Expo web build (https://app.iskotify.ph)
//   NEXT_PUBLIC_ANDROID_APP_URL → the Android early-access build (APK / Play
//                                 internal-test link). Until one exists, the
//                                 "Start for free" CTA points at the web app,
//                                 which IS the immediately-usable free trial.

export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_APP_URL || 'https://app.iskotify.ph'

export const ANDROID_APP_URL =
  process.env.NEXT_PUBLIC_ANDROID_APP_URL || WEB_APP_URL
