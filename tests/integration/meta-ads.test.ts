/**
 * Meta Marketing API against the real ad account (META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID).
 * Creates nothing and changes nothing: it only reads, and asks Meta to *validate* a request
 * (execution_options validate_only), so no campaign, ad set or ad appears and no money can be spent.
 * Skipped without credentials. Run with: npm run test:integration
 */
import 'dotenv/config'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }))

const configured = Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)

describe.skipIf(!configured)('Meta ads (real account, read-only + validate-only)', () => {
  it('reads the account and its campaigns', async () => {
    const { getSetup, listCampaigns } = await import('@/lib/services/meta-ads.service')
    const setup = await getSetup()
    expect(setup.problem).toBeUndefined()
    expect(setup.account?.currency).toBe('TRY')
    const campaigns = await listCampaigns()
    expect(Array.isArray(campaigns)).toBe(true)
    for (const c of campaigns) expect(Array.isArray(c.adSets)).toBe(true)
  })

  it('lets Meta validate a paused campaign without creating it', async () => {
    const { createCampaign, listCampaigns } = await import('@/lib/services/meta-ads.service')
    const before = (await listCampaigns()).length
    const r = await createCampaign({ name: 'ZUULAB doğrulama testi', objective: 'OUTCOME_TRAFFIC' }, 'test', true)
    expect(r).toEqual({ validated: true })
    expect((await listCampaigns()).length).toBe(before)
  })

  it('rejects a status change on an id that is not in the account', async () => {
    const { setStatus } = await import('@/lib/services/meta-ads.service')
    await expect(setStatus('1', 'PAUSED', 'test', false)).rejects.toBeTruthy()
  })

  it('refuses to go live without confirmation', async () => {
    const { setStatus } = await import('@/lib/services/meta-ads.service')
    await expect(setStatus('123456789', 'ACTIVE', 'test', false)).rejects.toThrow(/onay/)
  })
})

describe.skipIf(!configured)('Meta ads: ad set payload (validate-only)', () => {
  it.each([
    ['OUTCOME_TRAFFIC' as const, ['instagram_feed', 'instagram_reels', 'facebook_feed'] as const],
    ['OUTCOME_SALES' as const, [] as const],
    ['OUTCOME_AWARENESS' as const, ['instagram_stories'] as const],
  ])('Meta accepts a %s ad set', async (objective, placements) => {
    const { createAdSet, listCampaigns } = await import('@/lib/services/meta-ads.service')
    const campaigns = await listCampaigns()
    const match = campaigns.find((c) => c.objective === objective && c.dailyBudget === null)
    if (!match) return // no suitable existing campaign to validate against
    const r = await createAdSet(
      { campaignId: match.id, name: 'ZUULAB doğrulama testi', objective, campaignHasBudget: false, dailyBudget: 100, placements: [...placements], gender: 'all' },
      'test',
      true
    )
    expect(r).toEqual({ validated: true })
  })
})

describe.skipIf(!configured)('Meta ads: report (read-only)', () => {
  it('returns the account totals, per-campaign rows and a daily series that agree', async () => {
    const { getInsightsReport } = await import('@/lib/services/meta-ads.service')
    const end = new Date().toISOString().slice(0, 10)
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
    const report = await getInsightsReport({ start: day(29), end, previous: { start: day(59), end: day(30) } }, 'campaign', true)
    expect(report.currency).toBe('TRY')
    const spendOfRows = report.rows.reduce((a, r) => a + r.metrics.spend, 0)
    expect(spendOfRows).toBeCloseTo(report.current.spend, 1)
    const spendOfDays = report.daily.reduce((a, d) => a + d.spend, 0)
    expect(spendOfDays).toBeCloseTo(report.current.spend, 1)
    expect(report.current.reach).toBeLessThanOrEqual(report.current.impressions)
  })
})
