import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { createProductMaterial, listProductMaterials } from '@/lib/services/product-materials.service'

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  return NextResponse.json(
    { success: false, error: err.message || 'İşlem başarısız.' },
    { status: isForbidden ? 403 : err.isValidation ? 400 : 500 }
  )
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_UPDATE')
    return NextResponse.json({ success: true, materials: await listProductMaterials() })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const body = await request.json().catch(() => ({}))
    const material = await createProductMaterial({ name: body.name, description: body.description }, user.email)
    return NextResponse.json({ success: true, material })
  } catch (error) {
    return failure(error)
  }
}
