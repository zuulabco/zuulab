import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { logAuditEvent } from '@/lib/services/admin.service'

let storeSettings = {
  storeName: 'Zuulab 3D Studio',
  storeEmail: 'iletisim@zuulab.com',
  storePhone: '+90 216 555 0192',
  storeAddress: 'Moda Cad. Zuulab Tasarım Atölyesi No: 42, Kadıköy / İstanbul',
  currency: 'TRY',
  taxRate: 20,
  freeShippingThreshold: 750,
  orderPrefix: 'ZUU-2026',
  allowCustomerCancellation: true,
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'SETTINGS_MANAGE')

    return NextResponse.json({
      success: true,
      settings: storeSettings,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'SETTINGS_MANAGE')
    const body = await request.json().catch(() => ({}))

    storeSettings = {
      ...storeSettings,
      ...body,
    }

    await logAuditEvent({
      action: 'SETTINGS_UPDATED',
      entity: 'SystemSettings',
      metadata: { settings: storeSettings, adminEmail: user.email },
    })

    return NextResponse.json({
      success: true,
      message: 'Mağaza ve ticaret ayarları kaydedildi.',
      settings: storeSettings,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
