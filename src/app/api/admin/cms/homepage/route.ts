import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetCms,
  adminSaveDraftCms,
  adminPublishCms,
} from '@/lib/services/cms.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const { searchParams } = new URL(request.url)
    const mode = (searchParams.get('mode') as any) || 'DRAFT'

    const cms = await adminGetCms(mode)

    return NextResponse.json({
      success: true,
      cms,
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
    const { action, ...data } = body

    if (action === 'PUBLISH') {
      const published = await adminPublishCms(user.email)
      return NextResponse.json({
        success: true,
        message: 'İçerik başarıyla canlıya alındı (Yayınlandı).',
        cms: published,
      })
    }

    // Save draft
    const draft = await adminSaveDraftCms(data, user.email)
    return NextResponse.json({
      success: true,
      message: 'Taslak kaydedildi.',
      cms: draft,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
