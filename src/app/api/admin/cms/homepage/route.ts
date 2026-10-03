import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCms, adminSaveDraftCms, adminPublishCms } from '@/lib/services/cms.service'

/**
 * Homepage editor.
 *   GET   ?mode=DRAFT|PUBLISHED
 *   POST  { hero?, sections?, announcements? }   save as draft
 *   POST  { action: 'PUBLISH', hero?, sections? } save (when given) and put live
 */

function failure(error: unknown) {
  const err = error as { message?: string }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden) console.error('[admin/cms/homepage]', error)
  return NextResponse.json({ success: false, error: err.message || 'İşlem başarısız.' }, { status: isForbidden ? 403 : 500 })
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const mode = new URL(request.url).searchParams.get('mode') === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    return NextResponse.json({ success: true, cms: await adminGetCms(mode) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const { action, hero, sections, announcements } = await request.json().catch(() => ({}))

    if (hero || sections || announcements) {
      await adminSaveDraftCms({ hero, sections, announcements }, user.email)
    }

    if (action === 'PUBLISH') {
      const published = await adminPublishCms(user.email)
      try {
        revalidatePath('/', 'layout')
      } catch {
        // outside a request context
      }
      return NextResponse.json({ success: true, message: 'Ana sayfa yayınlandı.', cms: published })
    }

    return NextResponse.json({ success: true, message: 'Taslak kaydedildi.', cms: await adminGetCms('DRAFT') })
  } catch (error) {
    return failure(error)
  }
}
