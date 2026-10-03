import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { getSocialLinks, saveSocialLinks } from '@/lib/services/social.service'

function failure(error: unknown) {
  const err = error as { message?: string; isValidation?: boolean }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  if (!isForbidden && !err.isValidation) console.error('[admin/social]', error)
  return NextResponse.json({ success: false, error: err.message || 'İşlem başarısız.' }, { status: isForbidden ? 403 : err.isValidation ? 400 : 500 })
}

/** Footer social links: GET the list, PUT the whole list (order, add, remove, on/off) */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    return NextResponse.json({ success: true, links: await getSocialLinks() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))
    const links = await saveSocialLinks(body.links, user.email)
    try {
      revalidatePath('/', 'layout')
    } catch {
      // outside a request context
    }
    return NextResponse.json({ success: true, links })
  } catch (error) {
    return failure(error)
  }
}
