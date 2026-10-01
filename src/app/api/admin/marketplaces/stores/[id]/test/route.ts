import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { testStoreConnection } from '@/lib/services/marketplace/marketplace.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params

    const result = await testStoreConnection(id, user.id)

    return NextResponse.json({
      success: result.success,
      result,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.code === 'NOT_FOUND'
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Bağlantı testi yürütülemedi.',
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
