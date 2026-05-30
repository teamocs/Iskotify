// Namespaced Redis key builders. Always go through these — never inline a key string.
// The `v1` suffix lets us rotate a key schema later (e.g. when the Places response
// shape changes) without colliding with cached entries from the old schema.

export const RedisKey = {
  places: (lang: string, normalized: string) =>
    `places:school:v1:${lang}:${normalized}`,

  rateGemini: () => `rate:gemini:global:v1`,

  cacheHit:  (prefix: string) => `cache:hits:${prefix}:30d`,
  cacheMiss: (prefix: string) => `cache:misses:${prefix}:30d`,
} as const
