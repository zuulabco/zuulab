import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminDeleteCampaign, adminSetCampaignActive, adminUpdateCampaign } from '@/lib/services/campaigns.service'

interface RouteProps {
  params: Promise<{ id: string }>
}

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden && !err.isValidation) console.error('[admin/campaigns/:id]', error)
  return NextResponse.json(
    { success: false, error: err.message || 'İşlem başarısız.' },
    { status: isForbidden ? 403 : err.isValidation ? 400 : 500 }
  )
}

/** Full update, or `{ isActive }` alone to switch a campaign on or off */
export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (Object.keys(body).length === 1 && typeof body.isActive === 'boolean') {
      await adminSetCampaignActive(id, body.isActive, user.email)
      return NextResponse.json({ success: true })
    }
    const campaign = await adminUpdateCampaign(id, body, user.email)
    return NextResponse.json({ success: true, campaign })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const { id } = await params
    await adminDeleteCampaign(id, user.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}
