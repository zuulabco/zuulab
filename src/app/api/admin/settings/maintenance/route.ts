import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  getMaintenanceModeStatus,
  setMaintenanceModeStatus,
} from '@/lib/services/settings/maintenance-settings.service'

/**
 * GET /api/admin/settings/maintenance
 *
 * Returns current maintenance mode status, source (database, env, default),
 * allowed IPs, and last update timestamp.
 *
 * RBAC: Restricted to users with SETTINGS_MANAGE permission (ADMIN, SUPER_ADMIN).
 */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'SETTINGS_MANAGE')

    const status = await getMaintenanceModeStatus()

    return NextResponse.json({
      success: true,
      data: status,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yetkilendirme hatası.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

/**
 * PATCH /api/admin/settings/maintenance
 *
 * Toggles maintenance mode on/off in PostgreSQL Setting table.
 * Validates boolean input strictly.
 * Records audit log event (MAINTENANCE_MODE_ENABLED / MAINTENANCE_MODE_DISABLED).
 *
 * RBAC: Restricted to users with SETTINGS_MANAGE permission (ADMIN, SUPER_ADMIN).
 */
export async function PATCH(request: Request) {
  try {
    const user = await requirePermission(request, 'SETTINGS_MANAGE')

    const body = await request.json().catch(() => null)
    if (!body || typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Geçersiz parametre: "enabled" alanı boolean (true/false) olmalıdır.' },
        { status: 400 }
      )
    }

    const previousStatus = await getMaintenanceModeStatus()
    const updatedStatus = await setMaintenanceModeStatus(body.enabled, user.email)

    // Audit Logging
    const action = body.enabled ? 'MAINTENANCE_MODE_ENABLED' : 'MAINTENANCE_MODE_DISABLED'
    await logAuditEvent({
      userId: user.id,
      action,
      entity: 'SystemSettings',
      entityId: 'system.maintenance_mode',
      metadata: {
        adminEmail: user.email,
        adminRole: user.role,
        previousState: {
          enabled: previousStatus.enabled,
          source: previousStatus.source,
        },
        newState: {
          enabled: updatedStatus.enabled,
          source: updatedStatus.source,
        },
        timestamp: updatedStatus.updatedAt,
      },
    })

    return NextResponse.json({
      success: true,
      message: body.enabled
        ? 'Bakım modu başarıyla aktif edildi. Mağaza vitrini bakım ekranına alındı.'
        : 'Site başarıyla yayına alındı. Mağaza vitrini tüm ziyaretçilere açıldı.',
      data: updatedStatus,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İşlem gerçekleştirilemedi.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
