import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductDetails, saveProductDetails } from '@/lib/services/product-variants.service'

interface RouteProps {
  params: Promise<{ id: string }>
}

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden && !err.isValidation) console.error('[admin/products/details]', error)
  return NextResponse.json({ success: false, error: err.message || 'İşlem başarısız.' }, { status: isForbidden ? 403 : err.isValidation ? 400 : 500 })
}

/** Size, weight and the rows of "ölçüler ve detaylar" on the product page */
export async function GET(request: Request, { params }: RouteProps) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')
    const { id } = await params
    return NextResponse.json({ success: true, details: await getProductDetails(id) })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ success: true, details: await saveProductDetails(id, body, user.email) })
  } catch (error) {
    return failure(error)
  }
}
