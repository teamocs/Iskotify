import { describe, it, expect } from 'vitest'
import { RedisKey } from '../keys'

describe('RedisKey', () => {
  it('produces stable, versioned place keys', () => {
    expect(RedisKey.places('en', 'ph', 'ateneo')).toBe('places:school:v2:en:ph:ateneo')
    expect(RedisKey.places('fil', 'ph', 'pamantasan')).toBe('places:school:v2:fil:ph:pamantasan')
  })

  it('produces stable gemini rate-limit key', () => {
    expect(RedisKey.rateGemini()).toBe('rate:gemini:global:v1')
  })

  it('produces hit/miss counter keys', () => {
    expect(RedisKey.cacheHit('places')).toBe('cache:hits:places:30d')
    expect(RedisKey.cacheMiss('places')).toBe('cache:misses:places:30d')
  })
})
