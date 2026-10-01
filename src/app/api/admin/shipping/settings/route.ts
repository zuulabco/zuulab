import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getCarrierSettings,
  updateCarrierSettings,
} from '@/lib/services/shipping/shipping-settings.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const settings = await getCarrierSettings()

    const envStatus = {
      suratConfigured: Boolean(process.env.SURAT_CUSTOMER_CODE && process.env.SURAT_PASSWORD),
      yurticiConfigured: Boolean(process.env.YURTICI_WS_USERNAME && process.env.YURTICI_WS_PASSWORD),
    }

    const availableCarriers = [
      {
        id: 'SURAT',
        name: 'Sürat Kargo (Kurumsal SOAP)',
        isConfigured: envStatus.suratConfigured,
      },
      {
        id: 'YURTICI',
        name: 'Yurtiçi Kargo (KOPS Web Services)',
        isConfigured: envStatus.yurticiConfigured,
      },
      { id: 'MOCK', name: 'Mock Carrier (Simülasyon / Test)', isConfigured: true },
    ]

    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        envStatus,
        availableCarriers,
      },
      availableCarriers,
      envStatus,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo ayarları alınamadı.' },
      { status: isAuth ? 401 : 403 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request)
    const body = await request.json().catch(() => ({}))

    const updated = await updateCarrierSettings({
      outboundCarrier: body.outboundCarrier,
      returnCarrier: body.returnCarrier,
      updatedBy: admin.email,
    })

    const envStatus = {
      suratConfigured: Boolean(process.env.SURAT_CUSTOMER_CODE && process.env.SURAT_PASSWORD),
      yurticiConfigured: Boolean(process.env.YURTICI_WS_USERNAME && process.env.YURTICI_WS_PASSWORD),
    }

    const availableCarriers = [
      {
        id: 'SURAT',
        name: 'Sürat Kargo (Kurumsal SOAP)',
        isConfigured: envStatus.suratConfigured,
      },
      {
        id: 'YURTICI',
        name: 'Yurtiçi Kargo (KOPS Web Services)',
        isConfigured: envStatus.yurticiConfigured,
      },
      { id: 'MOCK', name: 'Mock Carrier (Simülasyon / Test)', isConfigured: true },
    ]

    return NextResponse.json({
      success: true,
      message: 'Kargo sağlayıcı ayarları güncellendi ve veritabanına kaydedildi.',
      settings: {
        ...updated,
        envStatus,
        availableCarriers,
      },
      envStatus,
      availableCarriers,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo ayarları güncellenemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
