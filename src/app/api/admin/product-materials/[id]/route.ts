import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { deleteProductMaterial, updateProductMaterial } from '@/lib/services/product-materials.service'

interface RouteProps {
  params: Promise<{ id: string }>
}

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  return NextResponse.json(
    { success: false, error: err.message || 'İşlem başarısız.' },
    { status: isForbidden ? 403 : err.isValidation ? 400 : 500 }
  )
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    await updateProductMaterial(id, { name: body.name, description: body.description }, user.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const { id } = await params
    await deleteProductMaterial(id, user.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}
