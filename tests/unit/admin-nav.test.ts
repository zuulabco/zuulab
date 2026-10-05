import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '@/app/admin/nav'

// Every page the menu reaches, tabs included (the quick search finds them too)
const items = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i, ...(i.tabs ?? [])]))

describe('admin navigation', () => {
  it('puts Satış and Katalog before Pazarlama, which is collapsed until opened', () => {
    const ids = NAV_SECTIONS.map((s) => s.id)
    expect(ids.indexOf('sales')).toBeLessThan(ids.indexOf('catalog'))
    expect(ids.indexOf('catalog')).toBeLessThan(ids.indexOf('marketing'))
    expect(NAV_SECTIONS.find((s) => s.id === 'marketing')!.collapsedByDefault).toBe(true)
  })

  it('groups marketing into five items with their own icons; related pages are tabs of one item', () => {
    const marketing = NAV_SECTIONS.find((s) => s.id === 'marketing')!
    expect(marketing.title).toBe('Pazarlama')
    expect(marketing.items.map((i) => i.label)).toEqual(['Genel bakış', 'Reklamlar', 'E-posta', 'Müşteri grupları', 'Site analizi'])
    expect(new Set(marketing.items.map((i) => i.icon)).size).toBe(5)
    const tabs = (label: string) => marketing.items.find((i) => i.label === label)!.tabs!.map((t) => t.href)
    expect(tabs('Reklamlar')).toEqual(['/marketing/meta', '/marketing/meta/report', '/marketing/meta/sales'])
    expect(tabs('Site analizi')).toEqual(['/analytics', '/seo', '/marketing/products'])
    for (const item of marketing.items.filter((i) => i.tabs)) expect(item.tabs![0].href).toBe(item.href)
  })

  it('no page is listed twice, tabs included', () => {
    const all = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => (i.tabs ? i.tabs.map((t) => t.href) : [i.href])))
    expect(new Set(all).size).toBe(all.length)
  })

  it('still reaches the marketing pages from the quick search (by their words)', () => {
    const find = (word: string) => items.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLocaleLowerCase('tr-TR').includes(word)).map((i) => i.href)
    expect(find('analizler')).toContain('/analytics')
    expect(find('dönüşüm')).toContain('/marketing')
    expect(find('search console')).toContain('/seo')
  })
})
