import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getMarketplaceStoreById,
  updateMarketplaceStore,
  deleteMarketplaceStore,
  type UpdateStoreInput,
} from '@/lib/services/marketplace/marketplace.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const store = await getMarketplaceStoreById(id)

    if (!store) {
      return NextResponse.json(
        { success: false, error: 'Mağaza bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      store,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Mağaza detayları alınamadı.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = (await request.json()) as UpdateStoreInput

    const updated = await updateMarketplaceStore(id, body, user.id)

    return NextResponse.json({
      success: true,
      store: updated,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.code === 'NOT_FOUND'
    const isValidation = error.code === 'VALIDATION_ERROR'
    return NextResponse.json(
      { success: false, error: error.message || 'Mağaza güncellenemedi.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : isValidation ? 400 : 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    await deleteMarketplaceStore(id, user.id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string }
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.code === 'NOT_FOUND'
    return NextResponse.json(
      { success: false, error: error.message || 'Mağaza silinemedi.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
