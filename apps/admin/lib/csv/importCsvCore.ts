import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValidatedRow } from './parseCsvRow'
import { composeOptions } from './composeOptions'

export interface ImportCsvResult {
  topic_ids: string[]
  total_cards: number
  cards_needing_enhancement: number
}

/**
 * Insert all validated CSV rows into Supabase. Upserts subjects by name, inserts
 * new draft topics tagged source_type='csv', inserts cards in batch. Returns the
 * created topic_ids so the caller can fire async Gemini enhancement jobs.
 *
 * Not transactional (Supabase REST doesn't expose tx); inserts run sequentially.
 * If a step fails, partial inserts remain — caller should treat this as best-effort.
 */
export async function importCsvCore(
  client: SupabaseClient,
  validatedRows: ValidatedRow[],
): Promise<ImportCsvResult> {
  // 1. Group rows by subject name
  const subjectNames = Array.from(new Set(validatedRows.map(r => r.subject)))
  const subjectIdByName = new Map<string, string>()
  for (const name of subjectNames) {
    const { data, error } = await client
      .from('flashcard_subjects')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single()
    if (error) throw new Error(`Failed to upsert subject "${name}": ${error.message}`)
    if (!data) throw new Error(`Subject upsert returned no data for "${name}"`)
    subjectIdByName.set(name, data.id)
  }

  // 2. Group rows by (subject, topic). New topic per pair.
  type TopicGroup = { subjectId: string; topicName: string; rows: ValidatedRow[]; topicId?: string }
  const topicGroups = new Map<string, TopicGroup>()
  for (const row of validatedRows) {
    const subjectId = subjectIdByName.get(row.subject)!
    const key = `${subjectId}::${row.topic}`
    if (!topicGroups.has(key)) {
      topicGroups.set(key, { subjectId, topicName: row.topic, rows: [] })
    }
    topicGroups.get(key)!.rows.push(row)
  }

  // 3. Insert one topic per group
  for (const group of topicGroups.values()) {
    const { data, error } = await client
      .from('flashcard_topics')
      .insert({ subject_id: group.subjectId, name: group.topicName, status: 'draft', source_type: 'csv' })
      .select('id')
      .single()
    if (error) throw new Error(`Failed to insert topic "${group.topicName}": ${error.message}`)
    group.topicId = data!.id
  }

  // 4. Build card inserts
  const cardInserts: any[] = []
  let cardsNeedingEnhancement = 0
  for (const group of topicGroups.values()) {
    for (const row of group.rows) {
      const insert: any = {
        topic_id: group.topicId,
        question: row.question,
        answer: row.answer,
        explanation: row.explanation,
        status: 'draft',
        listing_slugs: [],
      }
      if (row.distractors.length === 3) {
        const { options, correctIndex } = composeOptions(row.answer, row.distractors, row.question)
        insert.options = options
        insert.correct_answer_index = correctIndex
      } else {
        insert.options = []
        insert.correct_answer_index = null
        cardsNeedingEnhancement++
      }
      cardInserts.push(insert)
    }
  }

  // 5. Batch insert all cards
  const { error: cardErr } = await client.from('flashcards').insert(cardInserts)
  if (cardErr) throw new Error(`Failed to insert ${cardInserts.length} cards: ${cardErr.message}`)

  return {
    topic_ids: Array.from(topicGroups.values()).map(g => g.topicId!),
    total_cards: cardInserts.length,
    cards_needing_enhancement: cardsNeedingEnhancement,
  }
}
