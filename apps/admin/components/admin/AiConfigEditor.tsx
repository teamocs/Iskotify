'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AiConfigDefaults } from '@/lib/aiConfigDefaults'

interface AiChatConfigRow {
  id: number
  core_rules_override: string
  scope_block_override: string
  grounding_rule_override: string
  anti_injection_override: string
  progress_addendum_override: string
  topic_addendum_override: string
  math_addendum_override: string
  rag_total_token_budget: number
  rag_per_block_char_cap: number
  rag_blocks_enabled: {
    flashcards: boolean
    listings: boolean
    courses: boolean
    progress: boolean
  }
  chat_enabled: boolean
  updated_at: string | null
}

interface Props {
  initialConfig: AiChatConfigRow | null
  defaults: AiConfigDefaults
}

const EMPTY_BLOCKS = { flashcards: true, listings: true, courses: true, progress: true }

function toBlocks(raw: AiChatConfigRow['rag_blocks_enabled'] | undefined | null) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_BLOCKS }
  return {
    flashcards: raw.flashcards !== false,
    listings:   raw.listings !== false,
    courses:    raw.courses !== false,
    progress:   raw.progress !== false,
  }
}

export function AiConfigEditor({ initialConfig, defaults }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [coreRules, setCoreRules]   = useState(initialConfig?.core_rules_override ?? '')
  const [scopeBlock, setScopeBlock] = useState(initialConfig?.scope_block_override ?? '')
  const [grounding, setGrounding]   = useState(initialConfig?.grounding_rule_override ?? '')
  const [antiInject, setAntiInject] = useState(initialConfig?.anti_injection_override ?? '')
  const [progressAdd, setProgressAdd] = useState(initialConfig?.progress_addendum_override ?? '')
  const [topicAdd, setTopicAdd]     = useState(initialConfig?.topic_addendum_override ?? '')
  const [mathAdd, setMathAdd]       = useState(initialConfig?.math_addendum_override ?? '')

  const [totalBudget, setTotalBudget] = useState(initialConfig?.rag_total_token_budget ?? 0)
  const [charCap, setCharCap]         = useState(initialConfig?.rag_per_block_char_cap ?? 0)
  const [blocks, setBlocks]           = useState(toBlocks(initialConfig?.rag_blocks_enabled))
  const [chatEnabled, setChatEnabled] = useState(initialConfig?.chat_enabled ?? defaults.chatEnabled)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          core_rules_override: coreRules,
          scope_block_override: scopeBlock,
          grounding_rule_override: grounding,
          anti_injection_override: antiInject,
          progress_addendum_override: progressAdd,
          topic_addendum_override: topicAdd,
          math_addendum_override: mathAdd,
          rag_total_token_budget: totalBudget,
          rag_per_block_char_cap: charCap,
          rag_blocks_enabled: blocks,
          chat_enabled: chatEnabled,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setSuccess(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function OverrideField({
    label, value, setValue, placeholder,
  }: { label: string; value: string; setValue: (v: string) => void; placeholder: string }) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-[#1d1d1f]">{label}</label>
          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setValue('')}
              className="text-xs text-[#800000] hover:underline"
            >
              Reset to default
            </button>
          )}
        </div>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-[#1d1d1f] placeholder:text-[#b0b0b5] focus:outline-none focus:ring-2 focus:ring-[#800000]/30 resize-y font-mono"
          placeholder={placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <p className="text-[11px] text-[#aeaeb2]">Leave empty to use the app built-in.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Kill-switch — Kuya Baw is retired by default until an admin flips this on. */}
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm p-6 space-y-3">
        <h3 className="font-heading font-semibold text-[#1d1d1f] text-base">Kuya Baw Chat</h3>
        <p className="text-xs text-[#6e6e73]">
          Chat is retired by default app-wide (hero band, tab bar FAB, sidebar, and Practice tab
          entry points are all hidden) until this is turned on. Students already syncing pick up
          the change on their next app sync.
        </p>
        <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
            checked={chatEnabled}
            onChange={e => setChatEnabled(e.target.checked)}
          />
          <span className="text-sm font-semibold text-[#1d1d1f]">
            Chat enabled {chatEnabled ? '(live for all students)' : '(hidden for all students)'}
          </span>
        </label>
      </section>

      {/* Core guardrails */}
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm p-6 space-y-5">
        <h3 className="font-heading font-semibold text-[#1d1d1f] text-base">Core Rules Override</h3>
        <p className="text-xs text-[#6e6e73]">
          Replaces the entire CORE_RULES block (persona + all guardrails) when non-empty.
          If set, the individual guardrail overrides below are ignored for the core block.
        </p>
        <OverrideField
          label="Core Rules"
          value={coreRules}
          setValue={setCoreRules}
          placeholder={defaults.coreRules}
        />
      </section>

      {/* Individual guardrail pieces */}
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm p-6 space-y-5">
        <h3 className="font-heading font-semibold text-[#1d1d1f] text-base">Individual Guardrail Overrides</h3>
        <p className="text-xs text-[#6e6e73]">
          Applied only when Core Rules Override is empty — each piece overrides its corresponding
          builtin within the composed CORE_RULES block.
        </p>
        <OverrideField
          label="Scope Block"
          value={scopeBlock}
          setValue={setScopeBlock}
          placeholder={defaults.scopeBlock}
        />
        <OverrideField
          label="Grounding Rule"
          value={grounding}
          setValue={setGrounding}
          placeholder={defaults.groundingRule}
        />
        <OverrideField
          label="Anti-Injection Rule"
          value={antiInject}
          setValue={setAntiInject}
          placeholder={defaults.antiInjection}
        />
      </section>

      {/* Per-mode addenda */}
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm p-6 space-y-5">
        <h3 className="font-heading font-semibold text-[#1d1d1f] text-base">Per-Mode Addendum Overrides</h3>
        <p className="text-xs text-[#6e6e73]">
          Each override replaces the mode-specific addendum appended after CORE_RULES.
        </p>
        <OverrideField
          label="Progress Mode Addendum"
          value={progressAdd}
          setValue={setProgressAdd}
          placeholder={defaults.progressAddendum}
        />
        <OverrideField
          label="Topic Mode Addendum"
          value={topicAdd}
          setValue={setTopicAdd}
          placeholder={defaults.topicAddendum}
        />
        <OverrideField
          label="Math Mode Addendum"
          value={mathAdd}
          setValue={setMathAdd}
          placeholder={defaults.mathAddendum}
        />
      </section>

      {/* RAG budget */}
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm p-6 space-y-5">
        <h3 className="font-heading font-semibold text-[#1d1d1f] text-base">RAG Budget Settings</h3>
        <p className="text-xs text-[#6e6e73]">
          Set to 0 to use the app built-in defaults ({defaults.ragTotalTokenBudget} tokens total, {defaults.ragPerBlockCharCap} chars/block).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-[#1d1d1f]">Total Token Budget</label>
            <input
              type="number"
              min={0}
              max={4096}
              className="w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={totalBudget}
              onChange={e => setTotalBudget(Number(e.target.value))}
            />
            <p className="text-[11px] text-[#aeaeb2]">0 = use builtin ({defaults.ragTotalTokenBudget})</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-[#1d1d1f]">Per-Block Char Cap</label>
            <input
              type="number"
              min={0}
              max={2048}
              className="w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={charCap}
              onChange={e => setCharCap(Number(e.target.value))}
            />
            <p className="text-[11px] text-[#aeaeb2]">0 = use builtin ({defaults.ragPerBlockCharCap})</p>
          </div>
        </div>

        {/* Block toggles */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[#1d1d1f]">Enabled RAG Blocks</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['flashcards', 'listings', 'courses', 'progress'] as const).map(key => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                  checked={blocks[key]}
                  onChange={e => setBlocks(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span className="text-sm text-[#1d1d1f] capitalize">{key}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-[#aeaeb2]">Unchecked blocks are skipped during RAG retrieval.</p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-[980px] px-6 py-2.5 text-sm font-semibold bg-[#800000] text-white hover:bg-[#9a0a1f] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
        {success && (
          <span className="text-green-700 text-sm font-medium">Saved successfully.</span>
        )}
        {error && (
          <span className="text-red-600 text-sm">{error}</span>
        )}
      </div>
    </div>
  )
}
