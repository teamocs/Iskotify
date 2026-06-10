import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { AskKuyaModal } from '../components/AskKuyaModal'
import { KuyaDownloadSheet } from '../components/KuyaDownloadSheet'
import { modelExists, hasEnoughRam, warmUpLlama } from '../services/llm'
import { getGeminiKey } from '../services/geminiKey'
import { getSettings } from '../services/settings'
import { useDb } from '../hooks/useDb'

interface KuyaChatValue {
  open: () => void
}

const Ctx = createContext<KuyaChatValue | null>(null)

/**
 * Makes the Kuya Baw chat openable from anywhere (e.g. the center tab button).
 * Renders a single AskKuyaModal at the root; it's cheap when closed (its inner
 * — the LLM-backed chat — only mounts while visible).
 *
 * Also manages the download gate: when the model is not yet present, `open()`
 * shows KuyaDownloadSheet instead of the chat. The sheet auto-opens the chat
 * once the download completes.
 *
 * Provider routing:
 *   - If the user has configured Gemini (aiProvider === 'gemini') AND has a key
 *     stored in SecureStore, open chat directly — no RAM/model checks needed.
 *   - Otherwise fall through to the local model path (RAM gate → model check).
 *
 * Design decision: read settings + key via useDb/getGeminiKey on every `open()` tap
 * (one DB read + one SecureStore read per tap). This is simpler than mirroring
 * provider state to a second SecureStore key, and is fast enough (~1–5 ms) since
 * open() is user-initiated. KuyaChatProvider is always inside DrizzleProvider so
 * useDb() is available here.
 */
export function KuyaChatProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [chatVisible, setChatVisible] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)

  const openChat = useCallback(() => {
    // Prewarm the model as the modal begins opening so first-send latency is
    // just KV-cache fill, not full model load. warmUpLlama is a no-op if the
    // context is already initialised, and a no-op for Gemini mode.
    warmUpLlama()
    setChatVisible(true)
  }, [])
  const closeChat = useCallback(() => setChatVisible(false), [])

  const openSheet = useCallback(() => setSheetVisible(true), [])
  const closeSheet = useCallback(() => setSheetVisible(false), [])

  // Called by KuyaDownloadSheet when the native download task signals 'ready'.
  const onModelReady = useCallback(() => {
    setSheetVisible(false)
    // Prewarm immediately after download completes — the model file is now on
    // disk and the user is about to see the chat modal open.
    warmUpLlama()
    setChatVisible(true)
  }, [])

  // Tap handler: check provider preference first, then model availability.
  const open = useCallback(async () => {
    // --- Gemini cloud path ---
    // Check provider preference + key presence. Both reads are fast and
    // user-initiated so per-tap latency is acceptable (~1–5 ms total).
    try {
      const [settings, geminiKey] = await Promise.all([
        getSettings(db),
        getGeminiKey(),
      ])
      if (settings.aiProvider === 'gemini' && geminiKey !== null) {
        // Gemini configured — skip RAM/model checks entirely.
        openChat()
        return
      }
    } catch {
      // If reads fail, fall through to local path.
    }

    // --- Local model path ---
    if (!hasEnoughRam()) {
      // Show sheet which will render the 'unsupported' state immediately.
      openSheet()
      return
    }
    const exists = await modelExists()
    if (exists) {
      openChat()
    } else {
      openSheet()
    }
  }, [db, openChat, openSheet])

  const value = useMemo(() => ({ open }), [open])

  return (
    <Ctx.Provider value={value}>
      {children}
      <AskKuyaModal visible={chatVisible} onClose={closeChat} />
      <KuyaDownloadSheet visible={sheetVisible} onClose={closeSheet} onReady={onModelReady} />
    </Ctx.Provider>
  )
}

export function useKuyaChatModal(): KuyaChatValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useKuyaChatModal must be used within KuyaChatProvider')
  return v
}
