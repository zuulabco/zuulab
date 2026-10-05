import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  CampaignError,
  countAudience,
  deleteCampaign,
  getEmailOverview,
  previewCampaignHtml,
  saveCampaign,
  sendCampaign,
  sendTestEmail,
} from '@/lib/services/email-campaign.service'
import { countEligible, listAutomations, sendAutomationTest, setAutomationActive } from '@/lib/services/email-automation.service'
import { AUTOMATIONS } from '@/lib/email/automations'
import { consentCounts } from '@/lib/services/email-consent.service'

export const dynamic = 'force-dynamic'

/** GET → campaigns with their numbers, totals and subscriber counts */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const [overview, automations, consents] = await Promise.all([getEmailOverview(), listAutomations(), consentCounts()])
    const setup = {
      /** MOCK sends nothing for real */
      provider: (process.env.EMAIL_PROVIDER || 'MOCK').toUpperCase(),
      /** Without the signing secret Resend's events (delivered, opened, clicked) are refused */
      webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    }
    return NextResponse.json({ success: true, ...overview, automations, consents, setup }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return fail(error)
  }
}

const idSchema = z.string().min(1).max(64)
const automationKey = z.enum(AUTOMATIONS.map((a) => a.key) as [string, ...string[]])

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), id: idSchema.optional(), campaign: z.unknown() }),
  z.object({ action: z.literal('delete'), id: idSchema }),
  z.object({ action: z.literal('preview'), campaign: z.unknown() }),
  z.object({ action: z.literal('test'), id: idSchema, to: z.string().max(254) }),
  z.object({ action: z.literal('audience') }),
  z.object({ action: z.literal('automation-toggle'), key: automationKey, active: z.boolean() }),
  /** How many people the rule would mail right now; sends nothing */
  z.object({ action: z.literal('automation-preview'), key: automationKey }),
  z.object({ action: z.literal('automation-test'), key: automationKey, to: z.string().max(254) }),
  /** `recipients` is the number the admin confirmed on screen */
  z.object({ action: z.literal('send'), id: idSchema, recipients: z.number().int().min(1) }),
])

/** POST { action: save | delete | preview | test | audience | send, … } */
export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const parsed = actionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Geçersiz istek.' }, { status: 400 })
    const body = parsed.data

    switch (body.action) {
      case 'save':
        return NextResponse.json({ success: true, id: await saveCampaign(body.campaign, body.id, user.email) })
      case 'delete':
        await deleteCampaign(body.id)
        return NextResponse.json({ success: true })
      case 'preview':
        return NextResponse.json({ success: true, html: previewCampaignHtml(body.campaign) })
      case 'test':
        await sendTestEmail(body.id, body.to.trim())
        return NextResponse.json({ success: true })
      case 'audience':
        return NextResponse.json({ success: true, recipients: await countAudience() })
      case 'automation-toggle':
        await setAutomationActive(body.key as never, body.active, user.email)
        return NextResponse.json({ success: true })
      case 'automation-preview':
        return NextResponse.json({ success: true, eligible: await countEligible(body.key as never) })
      case 'automation-test':
        await sendAutomationTest(body.key as never, body.to.trim())
        return NextResponse.json({ success: true })
      case 'send':
        return NextResponse.json({ success: true, ...(await sendCampaign(body.id, body.recipients, user.email)) })
    }
  } catch (error) {
    return fail(error)
  }
}

function fail(error: unknown) {
  if (error instanceof CampaignError) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  const message = (error as Error)?.message || ''
  const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
  if (status === 500) console.error('[admin/email]', error)
  return NextResponse.json({ success: false, error: status === 500 ? 'İşlem tamamlanamadı.' : message }, { status })
}
