import { describe, expect, it } from 'vitest'
import {
  guessCategorySlug,
  guessCollectionSlug,
  htmlToText,
  nameSimilarity,
} from '@/lib/services/marketplace/listing-text'

describe('listing text helpers', () => {
  it('scores Turkish names regardless of case and diacritics', () => {
    expect(nameSimilarity('Zuulight Öfkeli Masa Lambası', 'ZUULIGHT ofkeli masa lambasi')).toBe(1)
    expect(nameSimilarity('Zuulight Nox Masa Lambası', 'Zuulight Opal Masa Lambası')).toBeGreaterThan(0.5)
    expect(nameSimilarity('Takı Organizeri Zarif Ağaç', 'Mini Dinozor Serisi')).toBe(0)
  })

  it('turns Trendyol HTML descriptions into readable text', () => {
    const html =
      '<div id="rich"><p>Zuulight&nbsp;Öfkeli &amp; şık</p><ul><li>USB-C</li><li>3D baskı</li></ul><br/>Not: &#304;stanbul</div>'
    expect(htmlToText(html)).toBe('Zuulight Öfkeli & şık\n• USB-C\n• 3D baskı\n\nNot: İstanbul')
    expect(htmlToText('<script>alert(1)</script>Merhaba')).toBe('Merhaba')
    expect(htmlToText(null)).toBe('')
  })

  it('guesses site categories and collections from Trendyol data', () => {
    expect(guessCategorySlug('Zuulight Spira Masa Lambası', 'Masa ve Gece Lambası')).toBe('aydinlatmalar')
    expect(guessCategorySlug('Kişiye Özel Araba Plaka Anahtarlık', 'Anahtarlık')).toBe('anahtarliklar')
    expect(guessCategorySlug('Takı Organizeri Zarif Ağaç', null)).toBe('masaustu-organizer')
    expect(guessCategorySlug('Zuukids Kesir Öğretici Yapboz', 'Yapboz')).toBe('oyun-eglence')
    expect(guessCategorySlug('Bilinmeyen Ürün', null)).toBe('ozel-tasarim')
    expect(guessCollectionSlug('Zuulight Opal Masa Lambası')).toBe('zuulight')
    expect(guessCollectionSlug('Zuukids Vidalı Şekil Eşleştirme')).toBe('zuukids')
    expect(guessCollectionSlug('Modern Havlu Askılığı')).toBeNull()
  })
})
