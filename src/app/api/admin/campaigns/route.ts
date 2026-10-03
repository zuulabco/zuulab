import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminCreateCampaign, adminListCampaigns } from '@/lib/services/campaigns.service'

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden && !err.isValidation) console.error('[admin/campaigns]', error)
  return NextResponse.json(
    { success: false, error: err.message || 'İşlem başarısız.' },
    { status: isForbidden ? 403 : err.isValidation ? 400 : 500 }
  )
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'COUPON_MANAGE')
    return NextResponse.json({ success: true, campaigns: await adminListCampaigns() })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const body = await request.json().catch(() => ({}))
    const campaign = await adminCreateCampaign(body, user.email)
    return NextResponse.json({ success: true, campaign })
  } catch (error) {
    return failure(error)
  }
}
