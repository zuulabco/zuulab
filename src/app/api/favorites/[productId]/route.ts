import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import {
  removeFavorite,
  getUserFavoriteProductIds,
} from '@/lib/services/favorites.service'

interface Context {
  params: Promise<{ productId: string }>
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireAuth(request)
    const { productId } = await params

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId belirtilmelidir.' },
        { status: 400 }
      )
    }

    await removeFavorite(user.id, productId)
    const updatedIds = await getUserFavoriteProductIds(user.id)

    return NextResponse.json({
      success: true,
      productIds: updatedIds,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Favori silinemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
