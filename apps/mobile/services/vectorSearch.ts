// ── Pure vector-search primitives (Phase 2 semantic retrieval foundation) ────
//
// These are the deterministic, fully-testable building blocks for on-device
// hybrid semantic retrieval (see docs/superpowers/plans/2026-07-03-kuya-rag-
// reliability.md, Phase 2). They are intentionally decoupled from any native
// module or DB access so they run in plain Jest — the embedding source
// (services/embeddings.ts) and the wiring into ragPipeline come later, gated on
// the on-device embedding spike.
//
// NOTHING here is wired into the live chat/RAG path yet.

export type Vec = Float32Array | number[]

/**
 * Cosine similarity of two vectors.
 * Returns 0 when either vector is empty, has zero norm, or the lengths differ —
 * so callers never see NaN and a degenerate vector simply contributes no signal.
 */
export function cosineSimilarity(a: Vec, b: Vec): number {
  const n = a.length
  if (n === 0 || b.length === 0 || n !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const av = a[i]!
    const bv = b[i]!
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * Symmetric per-vector int8 quantization (max-abs scaling).
 * scale = maxAbs / 127; q[i] = round(v[i] / scale), clamped to [-127, 127].
 * A zero vector yields scale 0 and an all-zero array (dequantize handles
 * scale 0 by returning zeros — no divide-by-zero / NaN).
 *
 * Used to shrink the synced embedding column ~4x on disk/in-memory while
 * keeping cosine similarity > 0.99 vs the original float vector.
 */
export function int8Quantize(v: Vec): { q: Int8Array; scale: number } {
  const n = v.length
  const q = new Int8Array(n)
  let maxAbs = 0
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(v[i]!)
    if (abs > maxAbs) maxAbs = abs
  }
  if (maxAbs === 0) return { q, scale: 0 }
  const scale = maxAbs / 127
  for (let i = 0; i < n; i++) {
    let qi = Math.round(v[i]! / scale)
    if (qi > 127) qi = 127
    else if (qi < -127) qi = -127
    q[i] = qi
  }
  return { q, scale }
}

/** Reverse int8Quantize: v[i] ≈ q[i] * scale. scale 0 → all zeros. */
export function int8Dequantize(q: Int8Array, scale: number): Float32Array {
  const n = q.length
  const out = new Float32Array(n)
  if (scale === 0) return out
  for (let i = 0; i < n; i++) out[i] = q[i]! * scale
  return out
}

/**
 * Brute-force cosine top-k over an in-memory corpus.
 * Returns up to min(k, corpus.length) results sorted by score descending.
 * Ties keep the original corpus order (stable).
 */
export function cosineTopK(
  query: Vec,
  corpus: Array<{ id: string; vec: Vec }>,
  k: number,
): Array<{ id: string; score: number }> {
  if (k <= 0 || corpus.length === 0) return []
  const scored = corpus.map((item, index) => ({
    id: item.id,
    score: cosineSimilarity(query, item.vec),
    index,
  }))
  // Stable sort: higher score first, ties broken by original index ascending.
  scored.sort((x, y) => (y.score - x.score) || (x.index - y.index))
  return scored.slice(0, Math.min(k, scored.length)).map(({ id, score }) => ({ id, score }))
}

/**
 * Reciprocal Rank Fusion of multiple ranked id lists.
 *
 * Rank convention: **1-based** — the first item in a list is rank 1. For each
 * list an id appears in, it accrues 1/(k + rank); scores sum across lists.
 * Default k = 60 (the standard RRF constant from Cormack et al. 2009).
 *
 * An id ranked #1 in two lists (2 · 1/(k+1)) therefore outscores an id ranked
 * #1 in only one. Ids appearing in a single list are still included. Ties keep
 * first-appearance order for determinism.
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>()
  const order: string[] = []
  for (const list of rankedLists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!
      const rank = i + 1 // 1-based
      if (!scores.has(id)) order.push(id)
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
    }
  }
  return order
    .map(id => ({ id, score: scores.get(id)!, first: order.indexOf(id) }))
    .sort((a, b) => (b.score - a.score) || (a.first - b.first))
    .map(({ id, score }) => ({ id, score }))
}
