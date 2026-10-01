import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { syncStoreOrders } from '@/lib/services/marketplace/ingestion.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params

    const result = await syncStoreOrders(id, {
      manual: true,
      adminUserId: user.id,
    })

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.code === 'NOT_FOUND'
    const isTemporary = error.code === 'TEMPORARY_ERROR'

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Mağaza senkronizasyonu gerçekleştirilemedi.',
      },
      {
        status: isForbidden ? 403 : isNotFound ? 404 : isTemporary ? 429 : 500,
      }
    )
  }
}
