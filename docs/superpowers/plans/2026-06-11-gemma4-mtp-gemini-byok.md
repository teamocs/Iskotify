# Gemma 4 E2B + MTP & Gemini BYOK Dual Mode — Spec & Plan

> Executed via superpowers:subagent-driven-development. THIS WAVE CONTAINS NATIVE CHANGES (llama.rn 0.12.4, expo-secure-store) → app.json version 1.5.0 → 1.6.0 (appVersion runtimeVersion policy), NO production OTA of this work (old runtime would crash); ships ONLY via the fresh APK build at the end. NativeWind REMOVED. Never `{count && <JSX/>}`.

## Verified facts (controller research)
- User-linked `gemma-4-qat-mobile` HF collection = Transformers/compressed-tensors ONLY (not loadable by llama.rn). The GGUF is `google/gemma-4-E2B-it-qat-q4_0-gguf` ≈ **3.35 GB** (≈4 GB-RAM device needed; current gate is 2 GB).
- llama.rn 0.12.4 (latest): `NativeSpeculativeType = 'none' | 'draft-mtp'` with **'mtp' as alias** — MTP needs NO second model (Gemma 4 has built-in MTP heads). ggml-org publishes Gemma 4 GGUFs → llama.cpp arch support exists. Release notes: 0.12.2 "MTP speculative decoding support", 0.12.3 "MTP parallel API".
- Google's HF repos are typically GATED (license) — direct unauthenticated download may 403. Implementer MUST verify an ungated GGUF mirror URL (try in order: `ggml-org/gemma-4-E2B-it-GGUF`, `unsloth/...`, `bartowski/google_gemma-4-E2B-it-GGUF` q4_0/Q4_K_M ~3.3-3.5GB) with an unauthenticated HEAD/range request; record the EXACT resolved URL + Content-Length; that size string drives all UI copy.
- User decision: **dual mode** = local Gemma 4 E2B (≥4 GB RAM) OR Gemini cloud with the USER'S OWN API key (BYOK — no fixed app key), securely stored, with a complete in-app guide to create a key in Google AI Studio (+ redirect link). Gemma 3 1B is retired.

## Task A — Local model: Gemma 4 E2B + MTP (llama.rn 0.12.4)
1. `apps/mobile/package.json`: llama.rn `^0.12.3` → `^0.12.4` (run install; verify lockfile updated; pnpm monorepo — run from repo root with the right filter).
2. `services/llm.ts`:
   - Model constants → the VERIFIED ungated Gemma 4 E2B GGUF (new MODEL_NAME/file, MODEL_URL, expected size). Update resolveDownloadUrl if mirror differs from bartowski redirect pattern.
   - `hasEnoughRam()`: gate ≥ 4 GB (read how it currently measures — expo-device totalMemory; keep a small safety margin, e.g. ≥ 3.6e9 bytes counts as "4 GB class" since OEMs under-report).
   - initLlama: add `speculative: 'mtp'` (alias of draft-mtp; wrap init in try/catch — ON INIT FAILURE retry ONCE without `speculative` and log, so an MTP-incompatible build degrades to plain decoding instead of bricking chat). Keep tuned params (n_batch 512, f16 KV, flash_attn auto, n_threads 6). n_ctx: Gemma 4 E2B supports 128K but KEEP 2048 (RAM).
   - Old-model cleanup: before starting the new download, delete the old gemma-3 gguf file if present (frees 750 MB); also a one-time cleanup in modelExists path (old file present but new absent → delete old, return false).
3. `components/KuyaDownloadSheet.tsx`: size copy → the verified size ("~3.4 GB — Wi-Fi strongly recommended"); unsupported copy → "needs at least a 4 GB-RAM phone — use a Gemini key instead" (links to Task B path).
4. `hooks/useModelDownload.ts`: any hardcoded size/filename references updated.
5. Tests: llm.test param assertions (speculative present; retry-without-speculative fallback unit-testable if init is mockable); download URL constant test. ON-DEVICE VERIFY (user, post-APK): model loads, MTP active (llama.rn logs), tokens/sec improved on a ≥4GB device.

## Task B — Gemini BYOK cloud mode
1. `npx expo install expo-secure-store` (native).
2. `services/geminiKey.ts`: SecureStore wrapper — `getGeminiKey/setGeminiKey/clearGeminiKey` (key id 'kuya_gemini_key'); NEVER in SQLite/export/sync/logs.
3. Provider preference: `userSettings.aiProvider text NOT NULL DEFAULT 'local'` (schema + MIGRATIONS ALTER, .notNull().default('local') — drift rule) + settings service get/update. Values 'local' | 'gemini'.
4. `services/geminiClient.ts`: `generateGeminiReply(apiKey, systemPrompt, userPrompt, opts)` → POST `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent` (key via `x-goog-api-key` header — NOT query string, avoids key in URL logs), body { systemInstruction, contents, generationConfig: { maxOutputTokens, temperature } }. Parse candidates[0].content.parts text. Error mapping: 400/403 → 'invalid key' message, 429 → 'quota reached — try again later', network → friendly retry. `validateGeminiKey(apiKey)` = tiny generateContent ping. Non-streaming (replies are 2-sentence capped; show the existing typing indicator) — note as accepted tradeoff.
5. **Key setup screen** `app/settings/gemini-key.tsx`: student-friendly COMPLETE guide — numbered steps: (1) "Open Google AI Studio" button → `Linking.openURL('https://aistudio.google.com/apikey')`, (2) "Sign in with your Google account", (3) "Tap 'Create API key'", (4) "Copy the key and paste it below". Plus: free-tier note ("Free to create — Google gives a free daily allowance"), masked TextInput (secureTextEntry, paste-friendly), Save → validateGeminiKey → on success store + set provider 'gemini' + success state; on failure inline friendly error. When a key exists: show masked (••••last4), "Replace key" + "Remove key" actions. A11y + tokens + ≥44pt.
6. `components/KuyaDownloadSheet.tsx`: when model absent → TWO paths: primary "Download Kuya's brain (~3.4 GB)" (hidden when RAM gate fails) + secondary "Use your own Gemini key (free)" → router.push the key screen (close sheet). Unsupported state → the Gemini path is the primary CTA.
7. Routing: `providers/KuyaChatProvider.tsx` open(): if provider==='gemini' && key exists → open chat directly (no local model needed). `hooks/useKuyaChat.ts` send(): provider==='gemini' → build the SAME prompt (modes/guardrails/context blocks unchanged) → `generateGeminiReply` → single append of reply (mutex + history + persistence identical). isModelReady semantics: ready = local model exists OR gemini configured.
8. Settings surface: add "AI Chat" row on the settings screen (navigates to gemini-key screen / shows provider).
9. Tests: geminiClient (global.fetch mocked: success parse, 400→invalid-key message, 429→quota message, header carries key not URL); key service (mock expo-secure-store); useKuyaChat gemini routing (mock client; assert prompt reuse + reply appended); schema drift test ride-along.

## Task C — Version bump + gates + fresh APK build
1. `apps/mobile/app.json` version 1.5.0 → **1.6.0** (native: llama.rn upgrade + expo-secure-store). Per policy, do NOT eas update the production channel with this work.
2. Full `npx jest` + `npx tsc --noEmit` + react-doctor on changed files. Commit + push.
3. Kick off `eas build -p android --profile production` (eas.json: android buildType apk, autoIncrement) — non-interactive, report build URL/status to the user.

## SDD execution
Task A → B → C; A and B both touch KuyaDownloadSheet + llm-adjacent files → strictly sequential, fresh implementer each, spec review + quality review each (security review emphasis on Task B: key never logged/synced/exported, header not URL). Final integration review before Task C build.
