import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { nextProductSku } from '@/lib/services/catalog-admin.service'

/** The SKU a new product gets when the field is left empty (shown as a hint) */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_CREATE')
    return NextResponse.json({ success: true, sku: await nextProductSku() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : 500 })
  }
}
