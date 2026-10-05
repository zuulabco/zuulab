import { describe, expect, it } from 'vitest'
import {
  changeOf, countryName, expectedCtr, lowCtrRows, movers, nearTopRows, pageKind, pathOfUrl, productRows, totalsOf, withPrevious,
  type GscRow,
} from '@/lib/analytics/seo'

const row = (key: string, clicks: number, impressions: number, position: number): GscRow => ({
  key, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position,
})

describe('totals and comparison', () => {
  it('sums days; position is weighted by impressions', () => {
    const t = totalsOf([row('a', 2, 100, 2), row('b', 3, 300, 6)])
    expect(t).toMatchObject({ clicks: 5, impressions: 400 })
    expect(t.ctr).toBeCloseTo(5 / 400)
    expect(t.position).toBeCloseTo(5) // (2*100 + 6*300) / 400
    expect(totalsOf([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
  })

  it('relative change is null with nothing to compare', () => {
    expect(changeOf(120, 100)).toBeCloseTo(0.2)
    expect(changeOf(50, 100)).toBeCloseTo(-0.5)
    expect(changeOf(5, 0)).toBeNull()
    expect(changeOf(5, null)).toBeNull()
  })

  it('attaches the previous period row, null when it was absent', () => {
    const out = withPrevious([row('x', 5, 50, 3), row('y', 1, 10, 9)], [row('x', 2, 40, 4)])
    expect(out[0].previous?.clicks).toBe(2)
    expect(out[1].previous).toBeNull()
  })
})

describe('pages and products', () => {
  it('reads paths and kinds', () => {
    expect(pathOfUrl('https://www.zuulab.com/urun/muse-lamba/?utm=1')).toBe('/urun/muse-lamba')
    expect(pathOfUrl('https://www.zuulab.com/')).toBe('/')
    expect(pageKind('/urun/x')).toBe('product')
    expect(pageKind('/kategori/x')).toBe('category')
    expect(pageKind('/')).toBe('home')
    expect(pageKind('/sss')).toBe('other')
  })

  it('folds URL variants of one product together and names it from the catalog', () => {
    const out = productRows(
      [
        { current: row('https://www.zuulab.com/urun/muse', 4, 100, 5), previous: row('https://www.zuulab.com/urun/muse', 1, 80, 6) },
        { current: row('https://zuulab.com/urun/muse/', 2, 100, 7), previous: null },
        { current: row('https://www.zuulab.com/kategori/lamba', 9, 900, 3), previous: null },
        { current: row('https://www.zuulab.com/urun/eski', 1, 10, 12), previous: null },
      ],
      [{ slug: 'muse', name: 'Zuulight Muse' }]
    )
    expect(out.map((r) => r.slug)).toEqual(['muse', 'eski'])
    expect(out[0]).toMatchObject({ name: 'Zuulight Muse', clicks: 6, impressions: 200 })
    expect(out[0].position).toBeCloseTo(6) // (5*100 + 7*100) / 200
    expect(out[0].previous?.clicks).toBe(1)
    expect(out[1].name).toBe('eski') // product no longer in the catalog: the slug stays readable
  })
})

describe('opportunities', () => {
  it('low CTR: well placed and seen often but clicked far less than expected, ignoring thin data', () => {
    const rows = [
      row('weak', 1, 400, 2), // expected 15% → clicked 0.25%
      row('fine', 70, 400, 2), // 17.5%
      row('thin', 0, 10, 2), // too few impressions
      row('deep', 0, 500, 15), // not on page one: a different problem
    ]
    expect(lowCtrRows(rows).map((r) => r.key)).toEqual(['weak'])
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5))
  })

  it('near the top: positions 4–20 with visibility, most seen first', () => {
    const rows = [row('top', 50, 500, 1.2), row('a', 1, 100, 8), row('b', 1, 300, 14), row('far', 0, 900, 40), row('thin', 0, 5, 9)]
    expect(nearTopRows(rows).map((r) => r.key)).toEqual(['b', 'a'])
  })

  it('movers: biggest click gains and losses against the previous period', () => {
    const rows = withPrevious(
      [row('up', 20, 100, 3), row('down', 2, 100, 3), row('same', 5, 100, 3), row('new', 4, 100, 3)],
      [row('up', 5, 100, 3), row('down', 12, 100, 3), row('same', 5, 100, 3)]
    )
    const m = movers(rows)
    expect(m.rising.map((x) => [x.row.key, x.clickChange])).toEqual([['up', 15], ['new', 4]])
    expect(m.falling.map((x) => [x.row.key, x.clickChange])).toEqual([['down', -10]])
  })
})

describe('countries', () => {
  it('turns Search Console codes into Turkish names', () => {
    expect(countryName('tur')).toBe('Türkiye')
    expect(countryName('xyz')).toBe('XYZ')
  })
})
