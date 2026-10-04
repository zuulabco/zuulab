import { NextResponse, after } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { cloudinaryService } from '@/lib/services/media/cloudinary.service'
import { adminAddMediaAsset } from '@/lib/services/cms.service'
import { warmProductImage } from '@/lib/services/media/warm'

export const dynamic = 'force-dynamic'
/** Room for preparing a product photo's sizes after the response (see warm.ts) */
export const maxDuration = 60

/**
 * Adds an image the browser uploaded straight to Cloudinary to the media library
 * (the old server-side upload did this itself). Only this account's Cloudinary URLs.
 * Product photos then get their shop sizes rendered in the background.
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
      usage?: string
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
    if (b.usage === 'product') {
      after(async () => {
        const result = await warmProductImage(url)
        if (result.failed) console.warn('[media/register] Some product photo sizes were not prepared:', result)
      })
    }
    return NextResponse.json({ success: true, asset })
  } catch (err) {
    const message = (err as Error).message || 'Görsel kaydedilemedi.'
    const isForbidden = message.includes('FORBIDDEN') || message.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: message }, { status: isForbidden ? 403 : 500 })
  }
}
