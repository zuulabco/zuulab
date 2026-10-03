import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductVariants, saveProductVariants } from '@/lib/services/product-variants.service'

interface RouteProps {
  params: Promise<{ id: string }>
}

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden && !err.isValidation) console.error('[admin/products/variants]', error)
  return NextResponse.json({ success: false, error: err.message || 'İşlem başarısız.' }, { status: isForbidden ? 403 : err.isValidation ? 400 : 500 })
}

/** Options (Renk, Boyut…) and one row per combination with its stock and photo */
export async function GET(request: Request, { params }: RouteProps) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')
    const { id } = await params
    return NextResponse.json({ success: true, ...(await getProductVariants(id)) })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const saved = await saveProductVariants(id, { options: body.options, variants: Array.isArray(body.variants) ? body.variants : [] }, user.email)
    return NextResponse.json({ success: true, ...saved })
  } catch (error) {
    return failure(error)
  }
}
