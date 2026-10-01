import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  rotateStoreCredentials,
  type RotateCredentialsInput,
} from '@/lib/services/marketplace/marketplace.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = (await request.json()) as RotateCredentialsInput

    if (!body.apiKey || !body.apiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Yeni API anahtarı ve API gizli anahtarı zorunludur.',
        },
        { status: 400 }
      )
    }

    const result = await rotateStoreCredentials(id, body, user.id)

    return NextResponse.json({
      success: true,
      message: 'Mağaza API anahtarları güvenli şekilde güncellendi ve döndürüldü.',
      version: result.version,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.code === 'NOT_FOUND'
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'API anahtarları döndürülemedi.',
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
