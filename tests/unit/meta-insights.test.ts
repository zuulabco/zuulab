import { describe, expect, it } from 'vitest'
import { dailySeries, metricsOf, pickAction, rowsByLevel, sumMetrics, type InsightRow } from '@/lib/meta-ads/insights'

const row: InsightRow = {
  campaign_id: 'c1',
  campaign_name: 'Mini Dinozor Kampanyası',
  spend: '3000.00',
  impressions: '100000',
  reach: '60000',
  inline_link_clicks: '2000',
  actions: [
    { action_type: 'omni_add_to_cart', value: '120' },
    { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '118' },
    { action_type: 'omni_initiated_checkout', value: '60' },
    { action_type: 'omni_purchase', value: '30' },
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '29' },
    { action_type: 'purchase', value: '29' },
  ],
  action_values: [
    { action_type: 'omni_purchase', value: '12500' },
    { action_type: 'purchase', value: '12400' },
  ],
}

describe('metricsOf', () => {
  it('reads one conversion once, from the first action type present', () => {
    const m = metricsOf(row)
    expect(m.addToCart).toBe(120)
    expect(m.initiateCheckout).toBe(60)
    expect(m.purchases).toBe(30)
    expect(m.purchaseValue).toBe(12500)
  })

  it('computes the rates from the raw sums', () => {
    const m = metricsOf(row)
    expect(m.ctr).toBeCloseTo(0.02)
    expect(m.cpc).toBeCloseTo(1.5)
    expect(m.cpm).toBeCloseTo(30)
    expect(m.roas).toBeCloseTo(4.1667, 3)
    expect(m.costPerPurchase).toBeCloseTo(100)
  })

  it('falls back to the pixel type when the omni one is missing', () => {
    expect(pickAction([{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' }], ['omni_purchase', 'offsite_conversion.fb_pixel_purchase'])).toBe(4)
    expect(pickAction(undefined, ['omni_purchase'])).toBe(0)
  })

  it('has no rate without a denominator, and never divides by zero', () => {
    const m = metricsOf({ spend: '10', impressions: '0', inline_link_clicks: '0' })
    expect([m.ctr, m.cpc, m.cpm, m.roas, m.costPerPurchase]).toEqual([null, null, null, 0, null])
    expect(metricsOf({}).roas).toBeNull()
  })
})

describe('sums and rows', () => {
  it('totals are sums of the raw numbers, not averages of rates', () => {
    const a = metricsOf({ spend: '100', impressions: '1000', inline_link_clicks: '10' })
    const b = metricsOf({ spend: '300', impressions: '9000', inline_link_clicks: '90' })
    const t = sumMetrics([a, b], 7000)
    expect(t.spend).toBe(400)
    expect(t.reach).toBe(7000)
    expect(t.ctr).toBeCloseTo(0.01)
    expect(t.cpm).toBeCloseTo(40)
  })

  it('lists rows of a level, biggest spender first, skipping rows without an id', () => {
    const rows = rowsByLevel(
      [
        { campaign_id: 'a', campaign_name: 'A', spend: '5' },
        { campaign_id: 'b', campaign_name: 'B', spend: '50' },
        { campaign_name: 'no id', spend: '99' },
      ],
      'campaign'
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('daily series is in date order', () => {
    const d = dailySeries([
      { date_start: '2026-10-02', spend: '2' },
      { date_start: '2026-10-01', spend: '1' },
    ])
    expect(d.map((x) => x.day)).toEqual(['2026-10-01', '2026-10-02'])
  })
})
