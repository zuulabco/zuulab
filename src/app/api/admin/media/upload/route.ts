import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { cloudinaryService } from '@/lib/services/media/cloudinary.service'
import { adminAddMediaAsset } from '@/lib/services/cms.service'

export const dynamic = 'force-dynamic'

/**
 * Admin Media Upload API Endpoint: /api/admin/media/upload
 * Validates permissions, file MIME type, size limit, and uploads to Cloudinary.
 */
export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'CONTENT_MANAGE')

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return NextResponse.json({ success: false, error: 'Yüklenecek dosya seçilmedi.' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const uploadResult = await cloudinaryService.uploadImage({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileBuffer: buffer,
        folder: 'zuulab-products',
      })

      if (!uploadResult.success) {
        return NextResponse.json({ success: false, error: uploadResult.error }, { status: 400 })
      }

      const asset = await adminAddMediaAsset(
        {
          name: file.name,
          url: uploadResult.url!,
          size: `${Math.round(file.size / 1024)} KB`,
          type: file.type,
          dimensions: `${uploadResult.width || 1200}x${uploadResult.height || 800}`,
        },
        user.email
      )

      return NextResponse.json({
        success: true,
        message: 'Dosya başarıyla yüklendi.',
        url: uploadResult.url,
        asset,
        isSimulated: uploadResult.isSimulated,
      })
    } else {
      // JSON payload upload metadata test
      const body = await request.json().catch(() => ({}))
      const { fileName, fileType, fileSize } = body

      if (!fileName || !fileType || typeof fileSize !== 'number') {
        return NextResponse.json(
          { success: false, error: 'Geçersiz parametreler: fileName, fileType, fileSize gereklidir.' },
          { status: 400 }
        )
      }

      const uploadResult = await cloudinaryService.uploadImage({
        fileName,
        fileType,
        fileSize,
      })

      if (!uploadResult.success) {
        return NextResponse.json({ success: false, error: uploadResult.error }, { status: 400 })
      }

      const asset = await adminAddMediaAsset(
        {
          name: fileName,
          url: uploadResult.url!,
          size: `${Math.round(fileSize / 1024)} KB`,
          type: fileType,
          dimensions: `${uploadResult.width || 1200}x${uploadResult.height || 800}`,
        },
        user.email
      )

      return NextResponse.json({
        success: true,
        message: 'Görsel kaydedildi.',
        url: uploadResult.url,
        asset,
        isSimulated: uploadResult.isSimulated,
      })
    }
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yükleme işlemi başarısız oldu.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
