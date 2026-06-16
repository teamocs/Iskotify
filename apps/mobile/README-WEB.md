# Iskotify Web — Deploy Guide

Static web build of the Iskotify mobile app (Expo Web / React Native Web).
Deploys to Vercel from the `apps/mobile` subdirectory of the monorepo.

---

## 1. Vercel — First-time project setup

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import the GitHub repository (`IskotifyApp`).
3. In **Configure Project**, set:
   - **Root Directory**: `apps/mobile`
   - **Framework Preset**: Other
   - Build Command and Output Directory are read from `vercel.json` automatically — leave them blank.
4. Expand **Advanced** and enable **Include source files outside of the Root Directory**. This is required for pnpm workspaces: the install command (`cd ../.. && pnpm install ...`) needs access to the monorepo root `pnpm-lock.yaml` and workspace packages.
5. Add the environment variables listed in section 2 below.
6. Click **Deploy**.

After the first deploy, every push to `master` triggers a new production deployment automatically.

---

## 2. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Optional | Google OAuth client ID for One Tap sign-in. Without it, the Google One Tap prompt is silently skipped; the "Continue with Google" OAuth button still works via Supabase redirect. |
| `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | Optional | Google Places API key for the school search autocomplete fallback. Without it, school search falls back to the Supabase ILIKE query only. |

Set all variables for the **Production** environment. For preview branches, duplicate as needed.

> **Tip:** Once deployed, copy your Vercel production URL and set `NEXT_PUBLIC_WEB_APP_URL=<url>` in the **admin** Vercel project (`apps/admin`) to surface a "Try on Web" button on the admin marketing landing page.

---

## 3. Supabase — Auth configuration

In the Supabase dashboard for your project:

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel production domain (e.g. `https://iskotify.vercel.app`).
3. Under **Redirect URLs**, add:
   ```
   https://<your-vercel-domain>/auth/callback
   ```
   Replace `<your-vercel-domain>` with your actual domain (e.g. `iskotify.vercel.app`).
   For preview deployments also add `https://*.vercel.app/auth/callback`.

---

## 4. Google Cloud Console — One Tap / OAuth

Only needed if you set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Edit the OAuth 2.0 Client ID used for web.
3. Under **Authorized JavaScript origins**, add your Vercel domain:
   ```
   https://<your-vercel-domain>
   ```
4. Under **Authorized redirect URIs**, your Supabase redirect should already be there (set during Supabase Google OAuth setup). If not, add:
   ```
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```

---

## 5. Local preview

```bash
# From the monorepo root:
cd apps/mobile
npx expo export -p web
npx serve dist
```

Then open `http://localhost:3000` in a browser.

---

## Limitations

| Feature | Web status |
|---|---|
| Kuya Baw (AI tutor) | Gemini BYOK only — user supplies their own API key from Google AI Studio; the local on-device Llama model cannot run in a browser |
| App data | Stored in the browser (IndexedDB). Cleared when the user clears site data. No cross-device sync on web. |
| Push notifications | Not available on web |
| File download (notes export) | Works via browser Blob download |
| Camera / file picker | Limited to browser file picker |
| OTA updates | Native only (expo-updates); web always serves the latest build from Vercel |
