import { describe, it, expect } from 'vitest'
import { RedisKey } from '../keys'

describe('RedisKey', () => {
  it('produces stable, versioned place keys', () => {
    expect(RedisKey.places('en', 'ateneo')).toBe('places:school:v1:en:ateneo')
    expect(RedisKey.places('fil', 'pamantasan')).toBe('places:school:v1:fil:pamantasan')
  })

  it('produces stable gemini rate-limit key', () => {
    expect(RedisKey.rateGemini()).toBe('rate:gemini:global:v1')
  })

  it('produces hit/miss counter keys', () => {
    expect(RedisKey.cacheHit('places')).toBe('cache:hits:places:30d')
    expect(RedisKey.cacheMiss('places')).toBe('cache:misses:places:30d')
  })
})
