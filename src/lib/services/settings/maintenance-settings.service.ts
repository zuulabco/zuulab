import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import {
  isMaintenanceModeEnabled,
  getMaintenanceAllowedIps,
  setCachedMaintenanceState,
  getCachedMaintenanceState,
  type MaintenanceModeStatus,
} from '@/lib/config/maintenance'

const SETTING_KEY_MAINTENANCE = 'system.maintenance_mode'

/**
 * Retrieves the current maintenance mode status.
 *
 * Evaluation hierarchy:
 * 1. Database Setting ('system.maintenance_mode') if database is configured and record exists.
 * 2. Environment variable (MAINTENANCE_MODE) fallback.
 * 3. Default (false).
 */
export async function getMaintenanceModeStatus(): Promise<MaintenanceModeStatus> {
  let dbValue: string | null = null
  let dbUpdatedAt: string | undefined = undefined

  if (isDatabaseConfigured) {
    try {
      const setting = await (db.orm.public.Setting as any).findUnique({
        where: { key: SETTING_KEY_MAINTENANCE },
      })
      if (setting && typeof setting.value === 'string') {
        dbValue = setting.value.trim().toLowerCase()
        if (setting.updatedAt) {
          dbUpdatedAt = setting.updatedAt.toISOString?.() ?? String(setting.updatedAt)
        }
      }
    } catch (err) {
      console.warn('[maintenance-settings] Failed to query maintenance mode from DB, falling back to cache/env:', err)
    }
  }

  let enabled: boolean
  let source: 'database' | 'env' | 'default'

  if (dbValue !== null) {
    enabled = dbValue === 'true' || dbValue === '1' || dbValue === 'yes'
    source = 'database'
  } else if (process.env.MAINTENANCE_MODE !== undefined && process.env.MAINTENANCE_MODE !== '') {
    enabled = isMaintenanceModeEnabled()
    source = 'env'
  } else {
    enabled = false
    source = 'default'
  }

  // Update in-memory cache
  setCachedMaintenanceState(enabled, source)

  return {
    enabled,
    source,
    allowedIps: getMaintenanceAllowedIps(),
    updatedAt: dbUpdatedAt,
  }
}

/**
 * Updates the maintenance mode state in PostgreSQL.
 *
 * Persists value to 'system.maintenance_mode' in Setting table and immediately
 * refreshes the in-process cache.
 */
export async function setMaintenanceModeStatus(
  enabled: boolean,
  adminEmail: string
): Promise<MaintenanceModeStatus> {
  const valueStr = enabled ? 'true' : 'false'
  const now = new Date()

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public.Setting as any).upsert({
        where: { key: SETTING_KEY_MAINTENANCE },
        create: {
          key: SETTING_KEY_MAINTENANCE,
          value: valueStr,
          type: 'boolean',
          group: 'system',
          label: 'Site Bakım Modu (Storefront Maintenance)',
        },
        update: {
          value: valueStr,
          updatedAt: now,
        },
      })
    } catch (err) {
      console.error('[maintenance-settings] Failed to update maintenance mode in DB:', err)
      throw new Error('Bakım modu veritabanına kaydedilemedi.')
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
  }

  // Immediately synchronize cache
  setCachedMaintenanceState(enabled, 'database')

  return {
    enabled,
    source: 'database',
    allowedIps: getMaintenanceAllowedIps(),
    updatedAt: now.toISOString(),
  }
}
