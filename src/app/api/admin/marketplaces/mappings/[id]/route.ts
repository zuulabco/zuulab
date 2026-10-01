import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { deleteProductMapping } from '@/lib/services/marketplace/marketplace.service'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params

    const deleted = await deleteProductMapping(id, user.id)

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Eşleştirme bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Ürün eşleştirmesi başarıyla kaldırıldı.',
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ürün eşleştirmesi silinemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
