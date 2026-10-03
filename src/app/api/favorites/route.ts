import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import {
  getUserFavoriteProductIds,
  getUserFavoriteProducts,
  addFavorite,
} from '@/lib/services/favorites.service'
import { toProductListItem } from '@/types/catalog'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const [productIds, favoriteProducts] = await Promise.all([
      getUserFavoriteProductIds(user.id),
      getUserFavoriteProducts(user.id),
    ])

    return NextResponse.json({
      success: true,
      productIds,
      // Card shape (inStock, primaryImage…), the same as product listings; stock already
      // counts variant combinations
      products: favoriteProducts.map(toProductListItem),
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Favoriler alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const { productId } = body

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId belirtilmelidir.' },
        { status: 400 }
      )
    }

    await addFavorite(user.id, productId)
    const updatedIds = await getUserFavoriteProductIds(user.id)

    return NextResponse.json({
      success: true,
      productIds: updatedIds,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Favori eklenirken hata oluştu.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
