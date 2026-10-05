import { describe, expect, it } from 'vitest'
import {
  MetaAdsInputError,
  buildAd,
  buildAdSet,
  buildCampaign,
  buildCreative,
  buildTargeting,
  describeGraphError,
  landingUrlProblem,
  toMinorUnits,
  type AdInput,
  type AdSetInput,
  type BuildContext,
} from '@/lib/meta-ads/builders'

const ctx: BuildContext = { maxDailyBudget: 1000, pixelId: '111222333', pageId: '999', siteHosts: ['zuulab.com', 'www.zuulab.com'] }

const adSet: AdSetInput = { campaignId: '123456', name: 'Anne ve bebek', objective: 'OUTCOME_TRAFFIC', campaignHasBudget: false, dailyBudget: 250 }
const ad: AdInput = {
  adSetId: '123456',
  name: 'Mini Dinozor',
  imageUrl: 'https://res.cloudinary.com/x/a.jpg',
  primaryText: 'Yeni gelenler',
  headline: 'Mini Dinozor',
  cta: 'SHOP_NOW',
  landingUrl: 'https://www.zuulab.com/urun/mini-dinozor',
}

describe('money', () => {
  it('turns lira into kuruş', () => {
    expect(toMinorUnits(250)).toBe('25000')
    expect(toMinorUnits(12.5)).toBe('1250')
    expect(toMinorUnits(0.1 + 0.2)).toBe('30')
  })
})

describe('campaigns', () => {
  it('are always created paused', () => {
    const p = buildCampaign({ name: 'Yaz kampanyası', objective: 'OUTCOME_TRAFFIC' }, ctx)
    expect(p.status).toBe('PAUSED')
    expect(p.daily_budget).toBeUndefined()
  })

  it('carry a campaign budget in kuruş when given', () => {
    const p = buildCampaign({ name: 'Yaz kampanyası', objective: 'OUTCOME_SALES', dailyBudget: 300 }, ctx)
    expect(p.daily_budget).toBe('30000')
    expect(p.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP')
  })

  it('refuse a budget above the cap, a short name and an unknown objective', () => {
    expect(() => buildCampaign({ name: 'Yaz kampanyası', objective: 'OUTCOME_SALES', dailyBudget: 1001 }, ctx)).toThrow(MetaAdsInputError)
    expect(() => buildCampaign({ name: 'ab', objective: 'OUTCOME_SALES' }, ctx)).toThrow(/3–200/)
    expect(() => buildCampaign({ name: 'Yaz kampanyası', objective: 'NOPE' as never }, ctx)).toThrow(/amacı/)
  })
})

describe('ad sets', () => {
  it('are paused, carry their budget and a goal that matches the objective', () => {
    const p = buildAdSet(adSet, ctx)
    expect(p.status).toBe('PAUSED')
    expect(p.daily_budget).toBe('25000')
    expect(p.optimization_goal).toBe('LANDING_PAGE_VIEWS')
    const sales = buildAdSet({ ...adSet, objective: 'OUTCOME_SALES' }, ctx)
    expect(sales.optimization_goal).toBe('OFFSITE_CONVERSIONS')
    expect(sales.promoted_object).toEqual({ pixel_id: '111222333', custom_event_type: 'PURCHASE' })
    expect(buildAdSet({ ...adSet, objective: 'OUTCOME_AWARENESS' }, ctx).optimization_goal).toBe('REACH')
  })

  it('leave the budget to the campaign when it has one', () => {
    const p = buildAdSet({ ...adSet, campaignHasBudget: true, dailyBudget: null }, ctx)
    expect(p.daily_budget).toBeUndefined()
    expect(() => buildAdSet({ ...adSet, campaignHasBudget: true }, ctx)).toThrow(/kampanyada/)
  })

  it('need exactly one budget, a cap, and an end date for a lifetime budget', () => {
    expect(() => buildAdSet({ ...adSet, dailyBudget: null }, ctx)).toThrow(/bütçe/)
    expect(() => buildAdSet({ ...adSet, lifetimeBudget: 500 }, ctx)).toThrow(/yalnızca biri/)
    expect(() => buildAdSet({ ...adSet, dailyBudget: 5000 }, ctx)).toThrow(/en fazla/)
    expect(() => buildAdSet({ ...adSet, dailyBudget: null, lifetimeBudget: 500 }, ctx)).toThrow(/bitiş/)
    const ok = buildAdSet({ ...adSet, dailyBudget: null, lifetimeBudget: 500, endTime: '2030-01-10T00:00:00Z' }, ctx)
    expect(ok.lifetime_budget).toBe('50000')
  })

  it('check ages and dates; sales needs the pixel', () => {
    expect(() => buildAdSet({ ...adSet, ageMin: 40, ageMax: 30 }, ctx)).toThrow(/Yaş/)
    expect(() => buildAdSet({ ...adSet, ageMin: 10 }, ctx)).toThrow(/Yaş/)
    expect(() => buildAdSet({ ...adSet, startTime: '2030-02-01T00:00:00Z', endTime: '2030-01-01T00:00:00Z' }, ctx)).toThrow(/sonra/)
    expect(() => buildAdSet({ ...adSet, objective: 'OUTCOME_SALES' }, { ...ctx, pixelId: '' })).toThrow(/Pixel/)
  })
})

describe('targeting', () => {
  it('defaults to Türkiye, 18–65, everyone, automatic placements', () => {
    const t = buildTargeting(adSet)
    expect(t.geo_locations).toEqual({ countries: ['TR'] })
    expect([t.age_min, t.age_max]).toEqual([18, 65])
    expect(t.genders).toBeUndefined()
    expect(t.publisher_platforms).toBeUndefined()
    expect(t.targeting_automation).toEqual({ advantage_audience: 0 })
  })

  it('maps gender, audiences and chosen placements', () => {
    const t = buildTargeting({
      ...adSet,
      gender: 'female',
      customAudienceIds: ['555'],
      placements: ['instagram_feed', 'instagram_reels', 'facebook_stories'],
      advantageAudience: true,
    })
    expect(t.genders).toEqual([2])
    expect(t.custom_audiences).toEqual([{ id: '555' }])
    expect(t.publisher_platforms).toEqual(['instagram', 'facebook'])
    expect(t.instagram_positions).toEqual(['stream', 'reels'])
    expect(t.facebook_positions).toEqual(['story'])
    expect(t.targeting_automation).toEqual({ advantage_audience: 1 })
  })
})

describe('ads', () => {
  it('builds a creative with the page, link, call to action and tracking tags', () => {
    const c = buildCreative(ad, ctx) as { object_story_spec: { page_id: string; link_data: Record<string, unknown> }; url_tags: string }
    expect(c.object_story_spec.page_id).toBe('999')
    expect(c.object_story_spec.link_data.picture).toBe(ad.imageUrl)
    expect(c.object_story_spec.link_data.call_to_action).toEqual({ type: 'SHOP_NOW', value: { link: ad.landingUrl } })
    expect(c.url_tags).toContain('utm_source=facebook')
    expect(c.url_tags).toContain('utm_campaign={{campaign.id}}')
    expect(c.url_tags).toContain('utm_content={{ad.id}}')
  })

  it('uses an uploaded image by its hash', () => {
    const c = buildCreative({ ...ad, imageUrl: null, imageHash: 'abc' }, ctx) as { object_story_spec: { link_data: Record<string, unknown> } }
    expect(c.object_story_spec.link_data.image_hash).toBe('abc')
    expect(c.object_story_spec.link_data.picture).toBeUndefined()
  })

  it('refuses without a page, an image, or a landing page outside the shop', () => {
    expect(() => buildCreative(ad, { ...ctx, pageId: '' })).toThrow(/META_PAGE_ID/)
    expect(() => buildCreative({ ...ad, imageUrl: null }, ctx)).toThrow(/görsel/)
    expect(() => buildCreative({ ...ad, landingUrl: 'https://evil.example/x' }, ctx)).toThrow(/sitenizde/)
    expect(() => buildCreative({ ...ad, landingUrl: 'http://zuulab.com/' }, ctx)).toThrow(/https/)
    expect(() => buildCreative({ ...ad, headline: '' }, ctx)).toThrow(/Başlık/)
  })

  it('is created paused', () => {
    expect(buildAd(ad, 'c1')).toEqual({ name: 'Mini Dinozor', adset_id: '123456', creative: { creative_id: 'c1' }, status: 'PAUSED' })
  })
})

describe('landing page check', () => {
  it('accepts only https on the shop hosts', () => {
    expect(landingUrlProblem('https://zuulab.com/', ctx.siteHosts)).toBeNull()
    expect(landingUrlProblem('https://zuulab.com.evil.net/', ctx.siteHosts)).toBeTruthy()
    expect(landingUrlProblem('not a url', ctx.siteHosts)).toBeTruthy()
  })
})

describe('Meta errors', () => {
  it('prefer the message meant for the user', () => {
    expect(describeGraphError({ message: 'x', error_user_msg: 'Bütçe çok düşük', error_user_title: 'Geçersiz bütçe', code: 100 })).toBe('Meta: Geçersiz bütçe: Bütçe çok düşük (kod 100)')
    expect(describeGraphError(null)).toMatch(/reddetti/)
  })
})

describe('Instagram account', () => {
  it('is sent as instagram_user_id, never the deprecated instagram_actor_id', () => {
    const c = buildCreative(ad, { ...ctx, instagramUserId: '17841478679340169' }) as { object_story_spec: Record<string, unknown> }
    expect(c.object_story_spec.instagram_user_id).toBe('17841478679340169')
    expect(c.object_story_spec.instagram_actor_id).toBeUndefined()
    expect((buildCreative(ad, ctx) as { object_story_spec: Record<string, unknown> }).object_story_spec.instagram_user_id).toBeUndefined()
  })
})
