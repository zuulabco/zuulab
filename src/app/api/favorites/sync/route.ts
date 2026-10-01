import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { syncLocalFavorites } from '@/lib/services/favorites.service'

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const { productIds } = body

    if (!Array.isArray(productIds)) {
      return NextResponse.json(
        { success: false, error: 'productIds dizi formatında olmalıdır.' },
        { status: 400 }
      )
    }

    const updatedIds = await syncLocalFavorites(user.id, productIds)

    return NextResponse.json({
      success: true,
      productIds: updatedIds,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Favoriler senkronize edilemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
