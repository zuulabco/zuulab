import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '@/lib/services/catalog-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')
    const categories = await adminGetCategories()

    return NextResponse.json({
      success: true,
      categories,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : error.isValidation ? 400 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, 'PRODUCT_CREATE')
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Kategori adı zorunludur.' },
        { status: 400 }
      )
    }

    const category = await adminCreateCategory(body, auth.email)

    return NextResponse.json({
      success: true,
      category,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : error.isValidation ? 400 : 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission(request, 'PRODUCT_UPDATE')
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Kategori ID zorunludur.' },
        { status: 400 }
      )
    }

    const category = await adminUpdateCategory(id, updates, auth.email)

    return NextResponse.json({
      success: true,
      category,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : error.isValidation ? 400 : 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission(request, 'PRODUCT_DELETE')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Kategori ID zorunludur.' },
        { status: 400 }
      )
    }

    await adminDeleteCategory(id, auth.email)

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : error.isValidation ? 400 : 500 }
    )
  }
}
