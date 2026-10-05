import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '@/app/admin/nav'

const items = NAV_SECTIONS.flatMap((s) => s.items)

describe('admin navigation', () => {
  it('has no page twice', () => {
    const hrefs = items.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('groups the marketing pages under Pazarlama, overview first', () => {
    const marketing = NAV_SECTIONS.find((s) => s.id === 'marketing')!
    expect(marketing.title).toBe('Pazarlama')
    expect(marketing.items.map((i) => i.href)).toEqual(['/marketing', '/analytics', '/seo'])
  })

  it('still reaches the marketing pages from the quick search (by their words)', () => {
    const find = (word: string) => items.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLocaleLowerCase('tr-TR').includes(word)).map((i) => i.href)
    expect(find('analizler')).toContain('/analytics')
    expect(find('dönüşüm')).toContain('/marketing')
    expect(find('search console')).toContain('/seo')
  })
})
