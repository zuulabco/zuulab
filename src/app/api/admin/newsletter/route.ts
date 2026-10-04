import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminDeleteSubscriber, adminListSubscribers, subscribersToCsv } from '@/lib/services/newsletter.service'

/** GET → subscriber list with counts; GET ?format=csv → active subscribers as a CSV download. */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const { subscribers, counts } = await adminListSubscribers()

    if (new URL(request.url).searchParams.get('format') === 'csv') {
      const date = new Date().toISOString().slice(0, 10)
      // BOM so Excel opens Turkish characters correctly
      return new NextResponse('﻿' + subscribersToCsv(subscribers), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="zuulab-bulten-${date}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json({ success: true, subscribers, counts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const err = error as { message?: string }
    const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
    if (!isForbidden) console.error('[admin/newsletter]', error)
    return NextResponse.json({ success: false, error: err.message || 'Liste alınamadı.' }, { status: isForbidden ? 403 : 500 })
  }
}

/** DELETE ?id=… → removes a subscriber for good (test sign-ups); see adminDeleteSubscriber */
export async function DELETE(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'Abone seçilmedi.' }, { status: 400 })
    const result = await adminDeleteSubscriber(id, user.email)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const err = error as { message?: string; isValidation?: boolean }
    const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('UNAUTHORIZED')
    if (!isForbidden && !err.isValidation) console.error('[admin/newsletter DELETE]', error)
    return NextResponse.json(
      { success: false, error: err.message || 'Silinemedi.' },
      { status: isForbidden ? 403 : err.isValidation ? 404 : 500 }
    )
  }
}
