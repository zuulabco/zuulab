import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminDuplicateProduct } from '@/lib/services/catalog-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_CREATE')
    const { id } = await params

    const duplicated = await adminDuplicateProduct(id, user.email)

    try {
      revalidatePath('/urunler')
      revalidatePath('/')
      revalidatePath('/koleksiyon/[slug]', 'page')
      revalidatePath('/kategori/[slug]', 'page')
      if (duplicated?.slug) {
        revalidatePath(`/urun/${duplicated.slug}`)
      }
    } catch (e) {
      console.warn('[revalidatePath error]:', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Ürün başarıyla çoğaltıldı.',
      product: duplicated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
