import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminBulkProductActions } from '@/lib/services/catalog-admin.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const body = await request.json().catch(() => ({}))
    const { ids, action } = body

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return NextResponse.json(
        { success: false, error: 'Ürün ID listesi ve eylem türü zorunludur.' },
        { status: 400 }
      )
    }

    const result = await adminBulkProductActions(ids, action, user.email)

    try {
      revalidatePath('/urunler')
      revalidatePath('/')
      revalidatePath('/koleksiyon/[slug]', 'page')
      revalidatePath('/kategori/[slug]', 'page')
    } catch (e) {
      console.warn('[revalidatePath error]:', e)
    }

    return NextResponse.json({
      success: true,
      message: `${result.count} ürün üzerinde toplu işlem uygulandı.`,
      result,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
