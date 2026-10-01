import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetCms,
  adminAddMediaAsset,
  adminDeleteMediaAsset,
} from '@/lib/services/cms.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const cms = await adminGetCms('DRAFT')

    return NextResponse.json({
      success: true,
      total: cms.media.length,
      media: cms.media,
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
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))

    if (!body.name || !body.url) {
      return NextResponse.json(
        { success: false, error: 'Dosya adı ve URL adresi zorunludur.' },
        { status: 400 }
      )
    }

    const asset = await adminAddMediaAsset(
      {
        name: body.name,
        url: body.url,
        size: body.size || '120 KB',
        type: body.type || 'image/webp',
        dimensions: body.dimensions || '1200x800',
      },
      user.email
    )

    return NextResponse.json({
      success: true,
      message: 'Medya kütüphanesine eklendi.',
      asset,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Silinecek medya ID belirtilmelidir.' }, { status: 400 })
    }

    const result = await adminDeleteMediaAsset(id, user.email)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Medya dosyası silindi.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
