import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { cloudinaryService, MAX_DIRECT_UPLOAD_BYTES } from '@/lib/services/media/cloudinary.service'

export const dynamic = 'force-dynamic'

/**
 * Signs one direct browser → Cloudinary upload. Files no longer pass through this
 * server, whose requests Vercel caps at ~4.5 MB (larger photos failed with 413).
 * Without Cloudinary credentials (local development) it answers direct: false and
 * the browser falls back to /api/admin/media/upload.
 */
export async function POST(request: Request) {
  try {
    await requirePermission(request, 'CONTENT_MANAGE')
    const body = (await request.json().catch(() => ({}))) as { fileType?: string; fileSize?: number }
    const check = cloudinaryService.validateFile(String(body.fileType || ''), Number(body.fileSize) || 0, MAX_DIRECT_UPLOAD_BYTES)
    if (!check.valid) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }
    const signed = cloudinaryService.signUpload('zuulab-products')
    if (!signed) return NextResponse.json({ success: true, direct: false })
    return NextResponse.json({ success: true, direct: true, ...signed })
  } catch (err) {
    const message = (err as Error).message || 'Yükleme izni alınamadı.'
    const isForbidden = message.includes('FORBIDDEN') || message.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: message }, { status: isForbidden ? 403 : 500 })
  }
}
