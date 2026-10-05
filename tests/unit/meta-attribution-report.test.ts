import { describe, expect, it } from 'vitest'
import { compareSales, isMetaSource, joinCampaigns } from '@/lib/meta-ads/attribution-report'
import { withRates, type NamedMetrics } from '@/lib/meta-ads/insights'

const meta = (id: string, name: string, spend: number, purchases = 0, value = 0): NamedMetrics => ({
  id,
  name,
  metrics: withRates({ spend, impressions: 1000, reach: 800, linkClicks: 50, addToCart: 0, initiateCheckout: 0, purchases, purchaseValue: value }),
})

describe('joinCampaigns', () => {
  it('matches visits and orders by campaign id or by name, ignoring case', () => {
    const r = joinCampaigns(
      [meta('111', 'Mini Dinozor', 1000, 10, 5000), meta('222', 'Zuukids', 500)],
      [
        { campaign: '111', visitors: 100, cartAdders: 20, checkoutStarters: 8 },
        { campaign: 'ZUUKIDS', visitors: 40, cartAdders: 4, checkoutStarters: 1 },
      ],
      [
        { campaign: '111', orders: 3, revenue: 1500 },
        { campaign: 'zuukids', orders: 1, revenue: 250 },
      ]
    )
    const a = r.campaigns.find((c) => c.id === '111')!
    const b = r.campaigns.find((c) => c.id === '222')!
    expect([a.visitors, a.orders, a.revenue]).toEqual([100, 3, 1500])
    expect([b.visitors, b.orders, b.revenue]).toEqual([40, 1, 250])
    expect(a.realRoas).toBeCloseTo(1.5)
    expect(a.metaRoas).toBeCloseTo(5)
    expect(a.costPerOrder).toBeCloseTo(333.33, 1)
  })

  it('keeps Meta traffic with an unknown or missing campaign tag on its own line, so totals add up', () => {
    const r = joinCampaigns(
      [meta('111', 'A', 100)],
      [
        { campaign: '111', visitors: 10, cartAdders: 1, checkoutStarters: 0 },
        { campaign: 'old-name', visitors: 5, cartAdders: 0, checkoutStarters: 0 },
        { campaign: '', visitors: 7, cartAdders: 2, checkoutStarters: 1 },
      ],
      [
        { campaign: '111', orders: 1, revenue: 300 },
        { campaign: '', orders: 2, revenue: 700 },
      ]
    )
    expect(r.unassigned).toMatchObject({ visitors: 12, orders: 2, revenue: 700, tags: ['old-name'] })
    expect(r.totals.visitors).toBe(22)
    expect(r.totals.orders).toBe(3)
    expect(r.totals.revenue).toBe(1000)
    expect(r.totals.realRoas).toBeCloseTo(10)
  })

  it('uses a tag for one campaign only, even if two campaigns share a name', () => {
    const r = joinCampaigns([meta('1', 'Aynı ad', 10), meta('2', 'Aynı ad', 10)], [{ campaign: 'aynı ad', visitors: 9, cartAdders: 0, checkoutStarters: 0 }], [])
    expect(r.campaigns.reduce((a, c) => a + c.visitors, 0)).toBe(9)
  })

  it('has no ratio without spend or orders', () => {
    const r = joinCampaigns([meta('1', 'A', 0)], [], [])
    expect([r.campaigns[0].realRoas, r.campaigns[0].costPerOrder, r.totals.realRoas]).toEqual([null, null, null])
  })

  it('lists campaigns biggest spender first', () => {
    const r = joinCampaigns([meta('1', 'A', 10), meta('2', 'B', 90)], [], [])
    expect(r.campaigns.map((c) => c.id)).toEqual(['2', '1'])
  })
})

describe('compareSales', () => {
  it('tells which side is higher, with a 25 % band called close', () => {
    expect(compareSales(1000, 900).verdict).toBe('close')
    expect(compareSales(1000, 400).verdict).toBe('meta-higher')
    expect(compareSales(1000, 1600).verdict).toBe('shop-higher')
    expect(compareSales(0, 0).verdict).toBe('none')
    expect(compareSales(0, 50).verdict).toBe('shop-higher')
  })
})

describe('isMetaSource', () => {
  it('recognises the Meta sources only', () => {
    expect(isMetaSource('Facebook')).toBe(true)
    expect(isMetaSource(' ig ')).toBe(true)
    expect(isMetaSource('google')).toBe(false)
    expect(isMetaSource(null)).toBe(false)
  })
})
