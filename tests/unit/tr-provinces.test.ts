import { describe, expect, it } from 'vitest'
import { matchProvince, suggestProvinces, TR_PROVINCES } from '@/lib/geo/tr-provinces'

describe('Turkish provinces', () => {
  it('has all 81 provinces, no duplicates', () => {
    expect(TR_PROVINCES).toHaveLength(81)
    expect(new Set(TR_PROVINCES).size).toBe(81)
  })

  it.each([
    ['istanbul', 'İstanbul'],
    ['İSTANBUL', 'İstanbul'],
    ['Istanbul', 'İstanbul'],
    ['izmir', 'İzmir'],
    ['IZMIR', 'İzmir'],
    ['sanliurfa', 'Şanlıurfa'],
    ['urfa', 'Şanlıurfa'],
    ['antep', 'Gaziantep'],
    ['K.Maraş', 'Kahramanmaraş'],
    ['icel', 'Mersin'],
    ['afyon', 'Afyonkarahisar'],
    ['  bolu ', 'Bolu'],
    ['igdir', 'Iğdır'],
    ['Hakkâri', 'Hakkari'],
    ['cankiri', 'Çankırı'],
  ])('matches %s → %s', (input, expected) => {
    expect(matchProvince(input)).toBe(expected)
  })

  it.each(['', 'istanbu', 'londra', 'Kadıköy', 'xyz'])('rejects %s', (input) => {
    expect(matchProvince(input)).toBeNull()
  })

  it('suggests prefix matches first', () => {
    expect(suggestProvinces('ka').slice(0, 3)).toEqual(['Kahramanmaraş', 'Karabük', 'Karaman'])
    expect(suggestProvinces('is')).toContain('İstanbul')
    expect(suggestProvinces('urfa')[0]).toBe('Şanlıurfa')
  })
})
