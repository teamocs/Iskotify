# Pre-Build Polish — Bookmark Removal, Ask Flow, LLM Speed — Spec & Plan

> Executed via superpowers:subagent-driven-development. Mobile only, JS-only → OTA (no app.json bump). NativeWind REMOVED. Never `{count && <JSX/>}`. Schema rule: NOT NULL migration columns need .notNull().default().

## Spec

### Task A — Remove bookmark/save-listing feature (complete)
Verified scope (explorer audit): NO dedicated Saved screen exists — the feature is only the 🔖 toggles. Remove:
- `app/(tabs)/listings.tsx`: savedListings import (:11), savedIds state (:78-79), saved-ids load (:102), toggleSave (:142-150), bookmark Pressable on rows (:338-346), isSaved (:282), bookmark styles (:266-268).
- `app/listings/[slug].tsx`: import (:11), saved state (:121), savedRows load (:264,:270), toggleSave (:311-320), 🔖 top-bar button (:422-429), saveBtn styles (:138-140). Top bar keeps back + title.
- `app/(tabs)/profile.tsx`: savedListings import (:29) + the reset-flow `tx.delete(savedListings).run()` (:397).
- `services/sync.ts`: import (:19); pushUserData: drop the savedListings select (:68-70) + `saved_listings` from the user_app_data payload (:83); pullUserData: drop the restore block (:158-162) — old remote payloads containing saved_listings are simply ignored (tolerant).
- `services/export.ts`: import (:10), export select (:30), payload field (:43), import restore block (:149-158) — old export files with the field import fine (ignored).
- `db/schema.ts`: delete savedListings table def (:70-73). `db/client.ts`: remove the CREATE TABLE from CREATE_SQL (fresh installs won't create it); do NOT add a DROP migration (existing devices keep a harmless orphan table — note in code comment near MIGRATIONS). 
- Tests: slug.test.tsx mock chains (:105,112-129), sync.test.ts ('restores focus_listings + saved_listings...' test :288-311 → drop the saved_listings part; mock payloads :296,325,353,381,432,462; CREATE TABLE :595; chain :1495), syncHeal.test.ts CREATE TABLE (:108). Export tests unaffected.
- Supabase user_app_data.saved_listings JSONB key: left in old rows, naturally deprecated. No remote migration.

### Task B — Home Ask flow → download sheet
`app/(tabs)/index.tsx` onAskPress (:271-284) still does the DELETED old flow: Alert "Install AI Reviewer first" → router.push to Practice (where the AiModelBanner no longer exists — dead end!). Fix:
- Replace with the provider flow: `const { open: openKuya } = useKuyaChatModal()` (same as TabBar); Ask pill onPress = `() => { void openKuya() }`. The provider handles ready→chat / absent→KuyaDownloadSheet / unsupported.
- DELETE from Home: useModelDownload import + `modelStatus` (:18,:203), the Alert flow, askPillDisabled styling/disabled prop (Ask is always tappable now), AND Home's local AskKuyaModal + chatVisible state (the provider already renders the chat modal at root — verify Home's instance is a duplicate before removing; if Home's modal predates the provider it is — remove it and the import).
- onKuyaTap (phrase cycling) unchanged.
- Tests: home.test.tsx — update any Ask/modelStatus assertions; add: pressing Ask calls the mocked useKuyaChatModal().open.

### Task C — LLM speed (gemma-dev-skill-grounded)
**MTP verdict (honest, per the official gemma-dev skill):** MTP is Gemma 4's built-in speculative decoding (assistant-model repos exist only for Gemma 4). Our model is Gemma 3 1B (correct choice for the 2GB-RAM gate per the same skill). Gemma 3 has NO MTP. Implementer must still VERIFY the installed llama.rn 0.12.3 typings: if a `speculative` config exists AND works with Gemma 3 without a second model download, enable it behind a try/catch; otherwise document why not (one comment in llm.ts citing Gemma-4-only MTP) and proceed. Do NOT swap models or add a draft-model download now (size/RAM regression before the APK build).
Chat data source verdict: chat path is ALREADY fully local (zero supabase in useKuyaChat/chatContext/retriever). The gap is caching + init params:
1. **Cache the stable table reads inside context builders** (services/chatContext.ts): buildListingsContext + buildCourseConnectionContext do FULL table scans per message. The OUTPUT is question-dependent (don't cache it); the INPUT reads are stable → wrap them: `cachedQuery('chat:listings-meta', 300_000, () => db.select(...listings...))` and `cachedQuery('chat:course-meta', 300_000, ...careerCourses + focusListings...)`. queryCache `invalidate('')` on sync already covers staleness; focus changes invalidate 'practice:'/'home:' — ALSO invalidate('chat:') in useFocusListings add/remove (one-line each).
2. **Pre-warm the model on chat open** (services/llm.ts + provider): export `warmUpLlama()` (fire-and-forget ensure-context). Call it when the chat opens (KuyaChatProvider openChat and/or AskKuyaModal mount) so init/model-load happens during the modal animation, not on first send. Extend the idle context release 60s → 300s (RAM tradeoff acceptable: released on background/teardown as today — verify where releaseContextNow is called).
3. **Init params** (services/llm.ts initLlama, verify each against node_modules/llama.rn typings before adding): `n_batch: 512`, `cache_type_k: 'f16'`, `cache_type_v: 'f16'`, `flash_attn_type: 'auto'`, keep `n_ctx: 2048` UNLESS a measured token budget (system+context+history+output) fits 1536 comfortably — implementer computes the worst case (math prompt + 250 out + 10-msg history) and decides, documenting the math in a comment. `n_threads`: 4 → 6 (typical big.LITTLE phones have ≥8 cores; llama.cpp saturates perf cores; if a cores API is trivially available cap at cores-2, else constant 6 with comment).
4. **Trim generation**: non-math nPredict 60 → 48 (responses are 2-sentence-capped; math stays 250). Stop tokens: ensure Gemma turn-end token is in stop list (check current completion params).
5. Tests: chatContext tests — assert the meta reads go through queryCache (spy on cachedQuery or assert second build call performs no new db.select via mock call counts). llm.ts param changes: type-check only (native, untestable in jest) + one unit test if warmUp is pure-wrappable.

## SDD execution
Task A → B → C (A and B both touch index.tsx? NO — A touches listings/detail/profile/sync/export; B touches index.tsx; disjoint, but run sequentially per SDD). Each: implementer → spec review → quality review. Final: full jest + tsc + react-doctor, push, OTA. Then the user builds the fresh APK (no native changes here — appVersion policy untouched).
