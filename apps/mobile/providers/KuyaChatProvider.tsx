import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { AskKuyaModal } from '../components/AskKuyaModal'
import { KuyaDownloadSheet } from '../components/KuyaDownloadSheet'
import { modelExists, hasEnoughRam, warmUpLlama } from '../services/llm'

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
 */
export function KuyaChatProvider({ children }: { children: ReactNode }) {
  const [chatVisible, setChatVisible] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)

  const openChat = useCallback(() => {
    // Prewarm the model as the modal begins opening so first-send latency is
    // just KV-cache fill, not full model load.  warmUpLlama is a no-op if the
    // context is already initialised.
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

  // Tap handler: check model availability at tap-time (one file-stat per tap;
  // never per-render). Unsupported devices skip the file check.
  const open = useCallback(async () => {
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
  }, [openChat, openSheet])

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
