import { describe, expect, it } from 'vitest'
import { SEGMENTS, SEGMENT_BY_KEY, SEGMENT_KEYS, isSegmentKey, missingSetting, resolveSettings } from '@/lib/segments/definitions'

describe('segment definitions', () => {
  it('every key has exactly one definition', () => {
    expect(SEGMENTS.map((s) => s.key).sort()).toEqual([...SEGMENT_KEYS].sort())
    for (const k of SEGMENT_KEYS) expect(SEGMENT_BY_KEY[k].label.length).toBeGreaterThan(3)
  })

  it('recognises only real keys', () => {
    expect(isSegmentKey('repeat_buyers')).toBe(true)
    expect(isSegmentKey('nope')).toBe(false)
    expect(isSegmentKey(undefined)).toBe(false)
  })

  it('fills defaults and keeps numbers in range', () => {
    expect(resolveSettings('inactive_customers').days).toBe(90)
    expect(resolveSettings('recent_buyers').days).toBe(30)
    expect(resolveSettings('high_spenders').minSpend).toBe(1000)
    expect(resolveSettings('recent_buyers', { days: 100000 }).days).toBe(365)
    expect(resolveSettings('recent_buyers', { days: -5 }).days).toBe(1)
    expect(resolveSettings('recent_buyers', { days: 'abc' }).days).toBe(30)
  })

  it('asks for a product or collection before counting', () => {
    expect(missingSetting('product_buyers', resolveSettings('product_buyers'))).toBeTruthy()
    expect(missingSetting('product_buyers', resolveSettings('product_buyers', { productId: 'p1' }))).toBeNull()
    expect(missingSetting('collection_viewers', resolveSettings('collection_viewers'))).toBeTruthy()
    expect(missingSetting('repeat_buyers', resolveSettings('repeat_buyers'))).toBeNull()
  })
})
