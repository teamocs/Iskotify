#!/usr/bin/env node
// apply-schools.mjs — Bulk-upsert Epic C school data into Supabase via PostgREST.
// Never passes ~6,500 rows through agent context — runs entirely in Node.
// Reads creds from apps/admin/.env.local. All upserts are idempotent.
//
// Upsert order (FK-safe):
//   1) tertiary_schools       (on_conflict=id)
//   2) university_profiles    (on_conflict=school_id)
//   3) course_school_rankings (on_conflict=id)
//   4) course_school_quality  (on_conflict=id)
//   5) bar_results            (on_conflict=id)
//
// NOTE: course_taxonomy_map is a small static table (board-exam tab → career mapping).
// It has no row builder — apply it separately via its seed SQL:
//   supabase/seed/course_taxonomy_map_seed.sql
// (already applied to the live DB via MCP; re-run that seed when taxonomy changes).
//
// Usage: node scripts/apply-schools.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// --- Load env ---
function loadEnv(path) {
  const out = {}
  let text
  try { text = readFileSync(path, 'utf8') } catch { return out }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

const env = loadEnv(resolve(repoRoot, 'apps/admin/.env.local'))
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.local')
  process.exit(1)
}

// --- PostgREST upsert ---
async function upsertChunk(tableName, conflictCol, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${tableName}?on_conflict=${conflictCol}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${tableName} upsert failed (${res.status}): ${body}`)
  }
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// Deduplicate rows by conflict key (last-writer-wins). PostgREST cannot handle
// two rows with the same conflict key in a single request (Postgres error 21000).
function dedup(rows, conflictCol) {
  const seen = new Map()
  for (const row of rows) seen.set(row[conflictCol], row)
  return [...seen.values()]
}

async function upsertTable(tableName, conflictCol, rows, chunkSize = 500) {
  if (rows.length === 0) { console.log(`  ${tableName}: 0 rows (skipped)`); return }
  const chunks = chunk(rows, chunkSize)
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    process.stdout.write(`  ${tableName}: chunk ${i + 1}/${chunks.length} (${c.length} rows)...\r`)
    await upsertChunk(tableName, conflictCol, c)
  }
  console.log(`  ${tableName}: ${rows.length} rows upserted OK                    `)
}

// --- Main ---
const main = async () => {
  console.log('Loading row builders...')

  // Import builders (these run ETL at import time for universities/nonboard)
  const { buildTertiarySchools, buildUniversityProfiles } =
    await import('./parse-universities.mjs')
  const { buildRankings, buildBarResults } =
    await import('./parse-rankings.mjs')
  const { buildQuality } =
    await import('./parse-nonboard.mjs')

  console.log('\nBuilding rows...')

  const tertiarySchools = dedup(buildTertiarySchools(), 'id')
  console.log(`  tertiary_schools:       ${tertiarySchools.length} rows`)

  const universityProfiles = dedup(buildUniversityProfiles(), 'school_id')
  console.log(`  university_profiles:    ${universityProfiles.length} rows`)

  const rankings = dedup(buildRankings(), 'id')
  console.log(`  course_school_rankings: ${rankings.length} rows`)

  const quality = dedup(buildQuality(), 'id')
  console.log(`  course_school_quality:  ${quality.length} rows`)

  const barResults = dedup(buildBarResults(), 'id')
  console.log(`  bar_results:            ${barResults.length} rows`)

  const total = tertiarySchools.length + universityProfiles.length + rankings.length + quality.length + barResults.length
  console.log(`\nTotal rows to upsert: ${total}`)
  console.log(`Supabase URL: ${SUPABASE_URL}\n`)

  console.log('Upserting in FK order...')
  await upsertTable('tertiary_schools',       'id',        tertiarySchools)
  await upsertTable('university_profiles',    'school_id', universityProfiles)
  await upsertTable('course_school_rankings', 'id',        rankings)
  await upsertTable('course_school_quality',  'id',        quality)
  await upsertTable('bar_results',            'id',        barResults)

  console.log('\nDone. Per-table upserted counts:')
  console.log(`  tertiary_schools:       ${tertiarySchools.length}`)
  console.log(`  university_profiles:    ${universityProfiles.length}`)
  console.log(`  course_school_rankings: ${rankings.length}`)
  console.log(`  course_school_quality:  ${quality.length}`)
  console.log(`  bar_results:            ${barResults.length}`)
}

main().catch(e => {
  console.error('\nFATAL:', e.message)
  process.exit(1)
})
