import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCms, adminSetAnnouncements } from '@/lib/services/cms.service'
import type { AnnouncementItem } from '@/lib/cms/homepage'

/**
 * Announcement bar items. Every change goes live immediately.
 *   GET     list
 *   POST    add one            { text, ctaLabel?, ctaHref?, active? }
 *   PUT     edit one           { id, ...fields }
 *   PATCH   reorder (drag)     { order: string[] }  ids in the new order
 *   DELETE  remove one         ?id=
 */

function failure(error: unknown) {
  const err = error as { message?: string }
  const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
  return NextResponse.json({ success: false, error: err.message || 'İşlem başarısız.' }, { status: isForbidden ? 403 : 500 })
}

async function current(): Promise<AnnouncementItem[]> {
  return [...(await adminGetCms('DRAFT')).announcements].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function save(list: AnnouncementItem[], email: string) {
  const saved = await adminSetAnnouncements(list, email)
  try {
    revalidatePath('/', 'layout')
  } catch {
    // outside a request context
  }
  return saved
}

function clean(body: Record<string, unknown>) {
  const text = String(body.text ?? '').trim()
  if (text.length < 3) throw new Error('Duyuru metni en az 3 karakter olmalıdır.')
  if (text.length > 160) throw new Error('Duyuru metni en fazla 160 karakter olabilir.')
  const ctaHref = String(body.ctaHref ?? '').trim()
  if (ctaHref && !ctaHref.startsWith('/') && !ctaHref.startsWith('https://')) {
    throw new Error('Bağlantı / ile başlamalı (site içi) ya da https:// olmalıdır.')
  }
  return {
    text,
    ctaLabel: String(body.ctaLabel ?? '').trim() || undefined,
    ctaHref: ctaHref || undefined,
  }
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    return NextResponse.json({ success: true, announcements: await current() })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))
    let fields
    try {
      fields = clean(body)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 })
    }
    const list = await current()
    const item: AnnouncementItem = { id: `ann-${Date.now()}`, ...fields, active: body.active !== false, sortOrder: list.length + 1 }
    const saved = await save([...list, item], user.email)
    return NextResponse.json({ success: true, message: 'Duyuru eklendi.', announcement: item, announcements: saved })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))
    const list = await current()
    const index = list.findIndex((a) => a.id === body.id)
    if (index === -1) return NextResponse.json({ success: false, error: 'Duyuru bulunamadı.' }, { status: 404 })

    const next = { ...list[index] }
    if ('text' in body || 'ctaLabel' in body || 'ctaHref' in body) {
      try {
        Object.assign(next, clean({ ...next, ...body }))
      } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 })
      }
    }
    if (typeof body.active === 'boolean') next.active = body.active
    list[index] = next
    const saved = await save(list, user.email)
    return NextResponse.json({ success: true, message: 'Duyuru güncellendi.', announcement: next, announcements: saved })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const body = await request.json().catch(() => ({}))
    const order: string[] = Array.isArray(body.order) ? body.order : []
    const list = await current()
    const byId = new Map(list.map((a) => [a.id, a]))
    const reordered = [
      ...order.map((id) => byId.get(id)).filter((a): a is AnnouncementItem => Boolean(a)),
      ...list.filter((a) => !order.includes(a.id)),
    ]
    const saved = await save(reordered, user.email)
    return NextResponse.json({ success: true, message: 'Sıralama kaydedildi.', announcements: saved })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'Duyuru ID zorunludur.' }, { status: 400 })
    const saved = await save((await current()).filter((a) => a.id !== id), user.email)
    return NextResponse.json({ success: true, message: 'Duyuru silindi.', announcements: saved })
  } catch (error) {
    return failure(error)
  }
}
