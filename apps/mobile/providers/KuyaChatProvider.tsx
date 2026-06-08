import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { AskKuyaModal } from '../components/AskKuyaModal'

interface KuyaChatValue {
  open: () => void
}

const Ctx = createContext<KuyaChatValue | null>(null)

/**
 * Makes the Kuya Baw chat openable from anywhere (e.g. the center tab button).
 * Renders a single AskKuyaModal at the root; it's cheap when closed (its inner
 * — the LLM-backed chat — only mounts while visible).
 */
export function KuyaChatProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const open = useCallback(() => setVisible(true), [])
  const close = useCallback(() => setVisible(false), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <Ctx.Provider value={value}>
      {children}
      <AskKuyaModal visible={visible} onClose={close} />
    </Ctx.Provider>
  )
}

export function useKuyaChatModal(): KuyaChatValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useKuyaChatModal must be used within KuyaChatProvider')
  return v
}
