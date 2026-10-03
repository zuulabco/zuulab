import { describe, expect, it } from 'vitest'
import { calculateShipping, shippingMethodFromSettings } from '@/lib/services/shipping.service'
import { defaultHomepage, newSection, normalizeHomepage, SECTION_TEMPLATES } from '@/lib/cms/homepage'
import { clipAtWord, tidyShortDescription } from '@/lib/utils'
import { isLocalRequest } from '@/lib/config/maintenance'

describe('shipping fee', () => {
  const method = shippingMethodFromSettings({ carrier: 'Sürat Kargo', fee: 110 })

  it('charges the configured fee below the threshold and nothing above it', () => {
    expect(calculateShipping(500, false, 750, method).shippingFee).toBe(110)
    expect(calculateShipping(750, false, 750, method).shippingFee).toBe(0)
    expect(calculateShipping(100, true, 750, method).shippingFee).toBe(0)
    expect(calculateShipping(100, false, 0, method).shippingFee).toBe(0)
  })

  it('falls back to defaults for missing or invalid settings', () => {
    expect(shippingMethodFromSettings({ fee: -5 }).price).toBe(110)
    expect(shippingMethodFromSettings(null).carrier).toBe('Sürat Kargo')
  })
})

describe('homepage document', () => {
  it('has the zuukids slide first, linking to the screw shape-matching set', () => {
    const doc = defaultHomepage()
    expect(doc.hero.slides[0].id).toBe('zuukids')
    expect(doc.hero.slides[0].secondaryProductSlug).toBe('zuukids-vidali-sekil-eslestirme-ve-siralama-seti')
  })

  it('drops unknown section types and fills missing settings', () => {
    const doc = normalizeHomepage({
      sections: [{ id: 'x', type: 'nope', enabled: true, settings: {} }, { id: 'r', type: 'product_rail', enabled: true, settings: { title: 'özel' } }],
    })
    expect(doc.sections).toHaveLength(1)
    const rail = doc.sections[0]
    expect(rail.type === 'product_rail' && rail.settings.title).toBe('özel')
    expect(rail.type === 'product_rail' && rail.settings.limit).toBe(4)
  })

  it('renumbers announcements in their stored order and clamps the slide interval', () => {
    const doc = normalizeHomepage({
      hero: { interval: 99 },
      announcements: [{ id: 'b', text: 'iki', sortOrder: 9, active: true }, { id: 'a', text: 'bir', sortOrder: 1, active: true }],
    })
    expect(doc.announcements.map((a) => [a.id, a.sortOrder])).toEqual([['b', 1], ['a', 2]])
    expect(doc.hero.interval).toBe(15)
  })

  it('creates every template with its defaults', () => {
    for (const type of Object.keys(SECTION_TEMPLATES) as Array<keyof typeof SECTION_TEMPLATES>) {
      expect(newSection(type).type).toBe(type)
    }
  })
})

describe('text helpers', () => {
  it('never cuts a word in half', () => {
    expect(clipAtWord('modern ofislerin vazgeçilmezi olacak', 24)).toBe('modern ofislerin…')
    expect(clipAtWord('kısa metin', 50)).toBe('kısa metin')
  })

  it('marks an imported summary that stopped mid-word', () => {
    const long = 'Keskin çizgileri ve zamansız siyah rengiyle modern ofislerin vazgeçilmezi.'
    expect(tidyShortDescription(long.slice(0, 50), long)).toMatch(/…$/)
    expect(tidyShortDescription('Tam cümle.', 'Tam cümle. Devamı')).toBe('Tam cümle.')
  })
})

describe('maintenance mode', () => {
  it('lets the developer in on localhost only', () => {
    expect(isLocalRequest('localhost', '::1')).toBe(true)
    expect(isLocalRequest('127.0.0.1', '127.0.0.1')).toBe(true)
    expect(isLocalRequest('www.zuulab.com', '127.0.0.1')).toBe(false)
    expect(isLocalRequest('localhost', '85.100.1.2')).toBe(false)
  })
})
