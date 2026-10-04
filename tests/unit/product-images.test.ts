import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/prisma/db', () => ({ db: {} }))

const { cleanImageList, MAX_PRODUCT_IMAGES } = await import('@/lib/services/catalog-admin.service')

describe('product gallery from the admin form', () => {
  it('keeps the order, drops blanks, repeats and the placeholder', () => {
    const out = cleanImageList([
      { url: ' https://res.cloudinary.com/a.jpg ' },
      { url: '' },
      { url: '/placeholder.png' },
      { url: 'https://res.cloudinary.com/b.jpg' },
      { url: 'https://res.cloudinary.com/a.jpg' },
      { url: '/images/c.webp' },
    ])
    expect(out.map((i) => i.url)).toEqual(['https://res.cloudinary.com/a.jpg', 'https://res.cloudinary.com/b.jpg', '/images/c.webp'])
  })

  it('refuses unsafe addresses and too many photos', () => {
    expect(() => cleanImageList([{ url: 'javascript:alert(1)' }])).toThrow(/Geçersiz görsel/)
    expect(() => cleanImageList([{ url: 'http://example.com/a.jpg' }])).toThrow(/Geçersiz görsel/)
    const many = Array.from({ length: MAX_PRODUCT_IMAGES + 1 }, (_, i) => ({ url: `https://x.test/${i}.jpg` }))
    expect(() => cleanImageList(many)).toThrow(/en fazla/)
  })
})
