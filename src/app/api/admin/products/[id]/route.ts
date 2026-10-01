import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetProductById,
  adminUpdateProduct,
  adminArchiveProduct,
} from '@/lib/services/catalog-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')
    const { id } = await params

    const product = await adminGetProductById(id)
    if (!product) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      product,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const updated = await adminUpdateProduct(id, body, user.email)

    try {
      revalidatePath('/urunler')
      revalidatePath('/')
      revalidatePath('/koleksiyon/[slug]', 'page')
      revalidatePath('/kategori/[slug]', 'page')
      if (updated?.slug) {
        revalidatePath(`/urun/${updated.slug}`)
      }
    } catch (e) {
      console.warn('[revalidatePath error]:', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Ürün güncellendi.',
      product: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_DELETE')
    const { id } = await params

    const archived = await adminArchiveProduct(id, user.email)

    try {
      revalidatePath('/urunler')
      revalidatePath('/')
      revalidatePath('/koleksiyon/[slug]', 'page')
      revalidatePath('/kategori/[slug]', 'page')
      if (archived?.slug) {
        revalidatePath(`/urun/${archived.slug}`)
      }
    } catch (e) {
      console.warn('[revalidatePath error]:', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Ürün güvenli bir şekilde arşivlendi.',
      product: archived,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
