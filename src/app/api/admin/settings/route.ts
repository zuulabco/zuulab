import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/services/permissions.service'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  getStoreSettings,
  updateStoreSettings,
} from '@/lib/services/settings/store-settings.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'SETTINGS_MANAGE')
    const settings = await getStoreSettings()

    return NextResponse.json({
      success: true,
      settings,
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

    const settings = await updateStoreSettings(body, user.email)

    try {
      revalidatePath('/odeme')
      revalidatePath('/sepet')
      revalidatePath('/api/shipping/threshold')
    } catch {
      // Non-blocking in non-Next serverless contexts
    }

    await logAuditEvent({
      action: 'SETTINGS_UPDATED',
      entity: 'SystemSettings',
      metadata: { settings, adminEmail: user.email },
    })

    return NextResponse.json({
      success: true,
      message: 'Mağaza ve ticaret ayarları kaydedildi.',
      settings,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

