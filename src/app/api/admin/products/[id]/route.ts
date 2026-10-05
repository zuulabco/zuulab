import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetProductById,
  adminUpdateProduct,
  adminArchiveProduct,
  adminDeleteProduct,
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


    return NextResponse.json({
      success: true,
      message: 'Ürün güncellendi.',
      product: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isValidation = error.statusCode === 400 || error.isValidation || error.message?.includes('Geçersiz')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : isValidation ? 400 : 500 }
    )
  }
}

/**
 * Archives the product. With ?permanent=1 it deletes an already archived product
 * for good (adminDeleteProduct says what blocks that).
 */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_DELETE')
    const { id } = await params

    if (new URL(request.url).searchParams.get('permanent') === '1') {
      await adminDeleteProduct(id, user.email)
      return NextResponse.json({ success: true, message: 'Ürün kalıcı olarak silindi.' })
    }

    const archived = await adminArchiveProduct(id, user.email)


    return NextResponse.json({
      success: true,
      message: 'Ürün güvenli bir şekilde arşivlendi.',
      product: archived,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isValidation = error.statusCode === 400 || error.isValidation
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : isValidation ? 400 : 500 }
    )
  }
}
