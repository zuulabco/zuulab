import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  MetaAdsError,
  createAd,
  createAdSet,
  createCampaign,
  getSetup,
  listAudiences,
  listCampaigns,
  listImages,
  setStatus,
} from '@/lib/services/meta-ads.service'
import { CTAS, MetaAdsInputError, OBJECTIVES, PLACEMENTS } from '@/lib/meta-ads/builders'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET → connection state, campaigns with their ad sets and ads, audiences and images to choose from */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const setup = await getSetup()
    if (!setup.configured || setup.problem) return NextResponse.json({ success: true, setup, campaigns: [], audiences: [], images: [] }, { headers: NO_STORE })
    const [campaigns, audiences, images] = await Promise.all([listCampaigns(), listAudiences().catch(() => []), listImages().catch(() => [])])
    return NextResponse.json(
      { success: true, setup, campaigns, audiences, images, options: { objectives: OBJECTIVES, placements: PLACEMENTS, ctas: CTAS } },
      { headers: NO_STORE }
    )
  } catch (error) {
    return fail(error)
  }
}

const id = z.string().regex(/^\d{5,25}$/)
const money = z.number().positive().max(1_000_000).nullable().optional()
const objective = z.enum(OBJECTIVES.map((o) => o.value) as [string, ...string[]])

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-campaign'),
    validateOnly: z.boolean().optional(),
    name: z.string().max(200),
    objective,
    dailyBudget: money,
  }),
  z.object({
    action: z.literal('create-adset'),
    validateOnly: z.boolean().optional(),
    campaignId: id,
    objective,
    campaignHasBudget: z.boolean(),
    name: z.string().max(200),
    dailyBudget: money,
    lifetimeBudget: money,
    startTime: z.string().max(40).nullable().optional(),
    endTime: z.string().max(40).nullable().optional(),
    countries: z.array(z.string().length(2)).max(20).optional(),
    ageMin: z.number().int().optional(),
    ageMax: z.number().int().optional(),
    gender: z.enum(['all', 'male', 'female']).optional(),
    placements: z.array(z.enum(PLACEMENTS.map((p) => p.value) as [string, ...string[]])).max(10).optional(),
    customAudienceIds: z.array(id).max(20).optional(),
    advantageAudience: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('create-ad'),
    validateOnly: z.boolean().optional(),
    adSetId: id,
    name: z.string().max(200),
    imageUrl: z.string().max(1000).nullable().optional(),
    imageHash: z.string().max(100).nullable().optional(),
    primaryText: z.string().max(2100),
    headline: z.string().max(120),
    description: z.string().max(220).nullable().optional(),
    cta: z.enum(CTAS.map((c) => c.value) as [string, ...string[]]),
    landingUrl: z.string().max(1000),
  }),
  /** Going live needs `confirm: true`; pausing never does */
  z.object({ action: z.literal('set-status'), id, status: z.enum(['ACTIVE', 'PAUSED']), confirm: z.boolean().optional() }),
])

/** POST { action: create-campaign | create-adset | create-ad | set-status, … }. Everything created is PAUSED. */
export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const parsed = body.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Geçersiz istek.' }, { status: 400 })
    const b = parsed.data
    const by = user.email

    switch (b.action) {
      case 'create-campaign':
        return NextResponse.json({ success: true, ...(await createCampaign(b as never, by, b.validateOnly)) })
      case 'create-adset':
        return NextResponse.json({ success: true, ...(await createAdSet(b as never, by, b.validateOnly)) })
      case 'create-ad':
        return NextResponse.json({ success: true, ...(await createAd(b as never, by, b.validateOnly)) })
      case 'set-status':
        await setStatus(b.id, b.status, by, b.confirm === true)
        return NextResponse.json({ success: true })
    }
  } catch (error) {
    return fail(error)
  }
}

function fail(error: unknown) {
  if (error instanceof MetaAdsError || error instanceof MetaAdsInputError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
  const message = (error as Error)?.message || ''
  const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
  if (status === 500) console.error('[admin/meta]', error)
  return NextResponse.json({ success: false, error: status === 500 ? 'İşlem tamamlanamadı.' : message }, { status })
}
