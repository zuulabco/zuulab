import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { buildStorePushPlan, pushStoreListings } from '@/lib/services/marketplace/listing-push.service'
import { listingErrorResponse } from '../../../listings/route-error'

/** Preview: what a push would send to this store right now (nothing is sent). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    return NextResponse.json({ success: true, plan: await buildStorePushPlan(id) })
  } catch (err) {
    return listingErrorResponse(err, 'Gönderim önizlemesi hazırlanamadı.')
  }
}

/** Sends the pending stock/price changes to the store now. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const result = await pushStoreListings(id, { adminUserId: user.id })
    return NextResponse.json({ success: result.status !== 'FAILED', result, error: result.errorMessage })
  } catch (err) {
    return listingErrorResponse(err, 'Gönderim yapılamadı.')
  }
}
