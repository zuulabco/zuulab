import { NextResponse } from 'next/server'
import { db } from '@/prisma/db'
import { requirePermission } from '@/lib/services/permissions.service'
import { SEGMENTS, SEGMENT_BY_KEY, isSegmentKey, type SegmentSettings } from '@/lib/segments/definitions'
import { getSegment, getSegmentOverview, reachableEmails } from '@/lib/services/segments.service'

export const dynamic = 'force-dynamic'

const run = <T>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>

function settingsFrom(params: URLSearchParams): SegmentSettings {
  const out: SegmentSettings = {}
  for (const k of ['minSpend', 'days'] as const) if (params.get(k)) out[k] = Number(params.get(k))
  for (const k of ['productId', 'collectionSlug'] as const) if (params.get(k)) out[k] = params.get(k) as string
  return out
}

/**
 * GET                       → every segment's count, plus the products and collections to choose from
 * GET ?key=…&days=…         → one segment with its settings and a list of people
 * GET ?key=…&format=csv     → e-mail addresses that may be mailed (ACTIVE permission), as a CSV file
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')

    if (key && url.searchParams.get('format') === 'csv') {
      await requirePermission(request, 'CONTENT_MANAGE')
      if (!isSegmentKey(key)) return NextResponse.json({ success: false, error: 'Bilinmeyen segment.' }, { status: 400 })
      const emails = await reachableEmails(key, settingsFrom(url.searchParams))
      const csv = ['email', ...emails.map((e) => `"${e.replace(/"/g, '""')}"`)].join('\r\n')
      return new NextResponse(`﻿${csv}\r\n`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="segment-${key}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    await requirePermission(request, 'ANALYTICS_VIEW')

    if (key) {
      if (!isSegmentKey(key)) return NextResponse.json({ success: false, error: 'Bilinmeyen segment.' }, { status: 400 })
      const segment = await getSegment(key, settingsFrom(url.searchParams))
      return NextResponse.json({ success: true, definition: SEGMENT_BY_KEY[key], segment }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const [overview, products, collections] = await Promise.all([
      getSegmentOverview(),
      run<{ id: string; name: string }>(
        db.raw.sql`SELECT id, name FROM products ORDER BY name LIMIT 500`.returnsRow({ id: 'pg/text@1', name: 'pg/text@1' } as never).build()
      ),
      run<{ slug: string; name: string }>(
        db.raw.sql`SELECT slug, name FROM collections ORDER BY name LIMIT 200`.returnsRow({ slug: 'pg/text@1', name: 'pg/text@1' } as never).build()
      ),
    ])
    return NextResponse.json(
      { success: true, definitions: SEGMENTS, overview, products, collections },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    const message = (error as Error)?.message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/segments]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Segmentler alınamadı.' : message }, { status })
  }
}
