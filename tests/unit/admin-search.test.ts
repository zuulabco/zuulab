import { describe, expect, it } from 'vitest'
import { foldText, matchScore, rankMatches, searchTokens } from '@/lib/admin-search'

describe('admin quick search matching', () => {
  it('folds Turkish letters and case', () => {
    expect(foldText('İADELER')).toBe('iadeler')
    expect(foldText('Sipariş Ödeme  Çağrı')).toBe('siparis odeme cagri')
    expect(searchTokens('  Kırmızı   VAZO ')).toEqual(['kirmizi', 'vazo'])
  })

  it('finds a page by name without Turkish letters', () => {
    expect(matchScore(searchTokens('iadeler'), ['İadeler'])).toBeGreaterThan(0)
    expect(matchScore(searchTokens('siparis'), ['Siparişler'])).toBeGreaterThan(0)
  })

  it('needs every word, in any order, across fields', () => {
    const fields = ['Aura Parametrik Vazo', 'ZL0004', 'Ev dekorasyonu']
    expect(matchScore(searchTokens('vazo aura'), fields)).toBeGreaterThan(0)
    expect(matchScore(searchTokens('vazo zl0004'), fields)).toBeGreaterThan(0)
    expect(matchScore(searchTokens('vazo lamba'), fields)).toBe(0)
  })

  it('matches phone numbers by digits', () => {
    expect(matchScore(searchTokens('5334251495'), ['0 533 425 14 95'])).toBeGreaterThan(0)
  })

  it('ranks exact and prefix matches first', () => {
    const items = ['Kablo düzenleyici ZL0012', 'ZL0001', 'Lamba ZL0001-B']
    expect(rankMatches(items, searchTokens('zl0001'), (s) => s.split(' '), 5)[0]).toBe('ZL0001')
  })
})
