#!/usr/bin/env node
// apply-universities-only.mjs — idempotent refresh of university data ONLY.
// Upserts tertiary_schools + university_profiles from the MASTER/province CSVs
// (via parse-universities.mjs builders) into Supabase prod. No deletes; no xlsx
// ETL (unlike apply-schools.mjs). Reads creds from apps/admin/.env.local.
//
// Usage: node scripts/apply-universities-only.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

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
  if (!res.ok) throw new Error(`${tableName} upsert failed (${res.status}): ${await res.text()}`)
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}
function dedup(rows, conflictCol) {
  const seen = new Map()
  for (const row of rows) seen.set(row[conflictCol], row)
  return [...seen.values()]
}
async function upsertTable(tableName, conflictCol, rows, chunkSize = 500) {
  if (rows.length === 0) { console.log(`  ${tableName}: 0 rows (skipped)`); return }
  const chunks = chunk(rows, chunkSize)
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`  ${tableName}: chunk ${i + 1}/${chunks.length} (${chunks[i].length} rows)...\r`)
    await upsertChunk(tableName, conflictCol, chunks[i])
  }
  console.log(`  ${tableName}: ${rows.length} rows upserted OK                    `)
}

const main = async () => {
  const { buildTertiarySchools, buildUniversityProfiles } =
    await import('./parse-universities.mjs')

  const tertiarySchools = dedup(buildTertiarySchools(), 'id')
  const universityProfiles = dedup(buildUniversityProfiles(), 'school_id')
  console.log(`\nUpserting to ${SUPABASE_URL}`)
  console.log(`  tertiary_schools:    ${tertiarySchools.length} rows`)
  console.log(`  university_profiles: ${universityProfiles.length} rows\n`)

  // FK-safe order: schools first, then profiles (profiles.school_id → schools.id).
  await upsertTable('tertiary_schools',    'id',        tertiarySchools)
  await upsertTable('university_profiles', 'school_id', universityProfiles)
  console.log('\nDone.')
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1) })
