import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCollections, adminUpdateCollection } from '@/lib/services/catalog-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')
    const collections = await adminGetCollections()

    return NextResponse.json({
      success: true,
      collections,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_UPDATE')
    const body = await request.json().catch(() => ({}))
    const { id, ...payload } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Koleksiyon ID belirtilmelidir.' }, { status: 400 })
    }

    const updated = await adminUpdateCollection(id, payload, user.email)

    return NextResponse.json({
      success: true,
      message: 'Koleksiyon güncellendi.',
      collection: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_CREATE')
    const body = await request.json().catch(() => ({}))

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'Koleksiyon adı belirtilmelidir.' }, { status: 400 })
    }

    const { adminCreateCollection } = await import('@/lib/services/catalog-admin.service')
    const created = await adminCreateCollection(body, user.email)

    return NextResponse.json({
      success: true,
      message: 'Koleksiyon oluşturuldu.',
      collection: created,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

