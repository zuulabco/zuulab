import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCms, adminSaveDraftCms, adminPublishCms } from '@/lib/services/cms.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const cms = await adminGetCms('DRAFT')

    return NextResponse.json({
      success: true,
      announcements: cms.announcements.sort((a, b) => a.sortOrder - b.sortOrder),
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
    const cms = await adminGetCms('DRAFT')

    const newAnnouncement = {
      id: `ann-${Date.now()}`,
      text: body.text,
      ctaLabel: body.ctaLabel || undefined,
      ctaHref: body.ctaHref || undefined,
      active: body.active !== undefined ? !!body.active : true,
      sortOrder: Number(body.sortOrder) || cms.announcements.length + 1,
    }

    const updatedList = [...cms.announcements, newAnnouncement]
    await adminSaveDraftCms({ announcements: updatedList }, user.email)
    await adminPublishCms(user.email) // auto publish announcement ticker changes

    return NextResponse.json({
      success: true,
      message: 'Duyuru eklendi.',
      announcement: newAnnouncement,
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
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Duyuru ID zorunludur.' }, { status: 400 })
    }

    const cms = await adminGetCms('DRAFT')
    const index = cms.announcements.findIndex((a) => a.id === id)
    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Duyuru bulunamadı.' }, { status: 404 })
    }

    const updatedList = [...cms.announcements]
    updatedList[index] = { ...updatedList[index], ...updates }

    await adminSaveDraftCms({ announcements: updatedList }, user.email)
    await adminPublishCms(user.email)

    return NextResponse.json({
      success: true,
      message: 'Duyuru güncellendi.',
      announcement: updatedList[index],
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
      return NextResponse.json({ success: false, error: 'Duyuru ID zorunludur.' }, { status: 400 })
    }

    const cms = await adminGetCms('DRAFT')
    const updatedList = cms.announcements.filter((a) => a.id !== id)

    await adminSaveDraftCms({ announcements: updatedList }, user.email)
    await adminPublishCms(user.email)

    return NextResponse.json({
      success: true,
      message: 'Duyuru silindi.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
