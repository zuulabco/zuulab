import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { cloudinaryService } from '@/lib/services/media/cloudinary.service'
import { adminAddMediaAsset } from '@/lib/services/cms.service'

export const dynamic = 'force-dynamic'

/**
 * Adds an image the browser uploaded straight to Cloudinary to the media library
 * (the old server-side upload did this itself). Only this account's Cloudinary URLs.
 */
export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')
    const b = (await request.json().catch(() => ({}))) as {
      url?: string
      name?: string
      bytes?: number
      type?: string
      width?: number
      height?: number
    }
    const url = String(b.url || '')
    if (!cloudinaryService.isOwnAssetUrl(url)) {
      return NextResponse.json({ success: false, error: 'Geçersiz görsel adresi.' }, { status: 400 })
    }
    const asset = await adminAddMediaAsset(
      {
        name: String(b.name || 'gorsel').slice(0, 200),
        url,
        size: `${Math.round((Number(b.bytes) || 0) / 1024)} KB`,
        type: String(b.type || 'image').slice(0, 60),
        dimensions: `${Number(b.width) || 0}x${Number(b.height) || 0}`,
      },
      user.email
    )
    return NextResponse.json({ success: true, asset })
  } catch (err) {
    const message = (err as Error).message || 'Görsel kaydedilemedi.'
    const isForbidden = message.includes('FORBIDDEN') || message.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: message }, { status: isForbidden ? 403 : 500 })
  }
}
