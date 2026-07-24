import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { AiConfigEditor } from '@/components/admin/AiConfigEditor'
import { AI_CONFIG_DEFAULTS } from '@/lib/aiConfigDefaults'
import type { AiConfigDefaults } from '@/lib/aiConfigDefaults'

export const dynamic = 'force-dynamic'

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

async function getConfig(): Promise<AiChatConfigRow | null> {
  const db = createServerClient()
  const { data } = await db.from('ai_chat_config').select('*').eq('id', 1).single()
  return (data ?? null) as AiChatConfigRow | null
}

export default async function AiConfigPage() {
  const config = await getConfig()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="AI Chat Config" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">AI Chat Config</h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              Override Kuya Baw&apos;s system prompts, guardrails, and RAG budget settings.
              Changes take effect for all students after their next app sync.
            </p>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-red-800 text-sm font-semibold">Warning</p>
            <p className="text-red-700 text-sm mt-1">
              These settings change Kuya Baw for ALL students after their next sync.
              Removing guardrails is dangerous — students may receive harmful or off-scope responses.
              Leave any field empty to use the app&apos;s built-in default.
            </p>
          </div>

          <AiConfigEditor initialConfig={config} defaults={AI_CONFIG_DEFAULTS as AiConfigDefaults} />
        </div>
      </div>
    </div>
  )
}
