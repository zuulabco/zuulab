import { describe, expect, it } from 'vitest'
import { absoluteUrl, metaDescription, pageMetadata, productSummary } from '@/lib/seo/metadata'
import { SITE_URL } from '@/lib/config/urls'

describe('seo helpers', () => {
  it('cuts long descriptions at a word boundary', () => {
    const text = 'Zuulight Muse Masa Lambası, akışkan formu ve heykelsi tasarımıyla yaşam alanlarını sıradan bir aydınlatmanın ötesine taşır. Doğadan ilham alan kıvrımlı yüzeyi ışığı yumuşatır.'
    const out = metaDescription(text)
    expect(out.length).toBeLessThanOrEqual(155)
    expect(out.endsWith('…')).toBe(true)
    expect(text.startsWith(out.slice(0, -1))).toBe(true)
    expect(out.slice(0, -1)).not.toMatch(/\s$/)
  })

  it('strips markup and collapses whitespace', () => {
    expect(metaDescription('<p>Kısa   ve\n<b>öz</b></p>')).toBe('Kısa ve öz')
  })

  it('prefers the full text over a clipped short description', () => {
    const description = 'Zuulight Brilla, katmanlı formu ve dokulu yüzeyiyle ışığı yalnızca aydınlatmaz; mekâna yayar.'
    expect(productSummary({ shortDescription: 'Zuulight Brilla Masa…', description })).toBe(description)
    expect(productSummary({ seoDescription: 'Elle yazılmış', shortDescription: 'x', description })).toBe('Elle yazılmış')
  })

  it('builds absolute URLs on the canonical host', () => {
    expect(absoluteUrl('/')).toBe(SITE_URL)
    expect(absoluteUrl('/urun/x')).toBe(`${SITE_URL}/urun/x`)
    expect(absoluteUrl('https://res.cloudinary.com/a.jpg')).toBe('https://res.cloudinary.com/a.jpg')
  })

  it('sends canonical, site name and a share image with every page', () => {
    const m = pageMetadata({ title: 'Hakkımızda', description: 'Hikayemiz', path: '/hakkimizda' })
    expect(m.alternates?.canonical).toBe('/hakkimizda')
    expect(m.openGraph).toMatchObject({ siteName: 'zuulab', locale: 'tr_TR', url: '/hakkimizda', title: 'Hakkımızda · zuulab' })
    expect((m.openGraph as { images: unknown[] }).images).toHaveLength(1)
    expect(m.robots).toBeUndefined()
  })
})
