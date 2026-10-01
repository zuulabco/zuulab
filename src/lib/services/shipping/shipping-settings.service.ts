import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import type { ShippingProviderType } from './shipping.interface'

export interface CarrierEnvironmentStatus {
  suratConfigured: boolean
  yurticiConfigured: boolean
}

export interface CarrierSettings {
  outboundCarrier: ShippingProviderType
  returnCarrier: ShippingProviderType
  updatedAt: string
  updatedBy?: string
  envStatus?: CarrierEnvironmentStatus
}

const SETTING_KEY_OUTBOUND = 'shipping.outbound_carrier'
const SETTING_KEY_RETURN = 'shipping.return_carrier'

// Dev-only in-memory cache
let _devCache: CarrierSettings = {
  outboundCarrier: (process.env.OUTBOUND_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER || 'MOCK') as ShippingProviderType,
  returnCarrier: (process.env.RETURN_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER || 'MOCK') as ShippingProviderType,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
}

/**
 * Returns current carrier environment configuration status without exposing credentials
 */
export function getCarrierEnvironmentStatus(): CarrierEnvironmentStatus {
  return {
    suratConfigured: Boolean(process.env.SURAT_CUSTOMER_CODE && process.env.SURAT_PASSWORD),
    yurticiConfigured: Boolean(process.env.YURTICI_WS_USERNAME && process.env.YURTICI_WS_PASSWORD),
  }
}

/**
 * Reads carrier settings from DB (Setting table) with env var default/fallback.
 * Admin selections in DB take priority across serverless instances.
 */
export async function getCarrierSettings(): Promise<CarrierSettings> {
  const envOutbound = process.env.OUTBOUND_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER
  const envReturn = process.env.RETURN_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER

  let dbOutbound: string | null = null
  let dbReturn: string | null = null
  let dbUpdatedAt = new Date().toISOString()
  let dbUpdatedBy = 'system'

  if (isDatabaseConfigured) {
    try {
      const settings = await (db.orm.public.Setting as any).findMany({
        where: { key: { in: [SETTING_KEY_OUTBOUND, SETTING_KEY_RETURN] } },
      })
      for (const s of settings) {
        if (s.key === SETTING_KEY_OUTBOUND && s.value) {
          dbOutbound = s.value
          dbUpdatedAt = s.updatedAt?.toISOString?.() ?? dbUpdatedAt
        }
        if (s.key === SETTING_KEY_RETURN && s.value) {
          dbReturn = s.value
        }
      }
    } catch (err) {
      console.warn('[shipping-settings] DB read failed, using defaults:', err)
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
  }

  // Priority: 1. DB persisted setting, 2. Dev Cache (if updated), 3. Environment variables, 4. Default MOCK
  const resolvedOutbound = (dbOutbound || _devCache.outboundCarrier || envOutbound || 'MOCK') as ShippingProviderType
  const resolvedReturn = (dbReturn || _devCache.returnCarrier || envReturn || 'MOCK') as ShippingProviderType

  _devCache = {
    outboundCarrier: resolvedOutbound,
    returnCarrier: resolvedReturn,
    updatedAt: dbUpdatedAt,
    updatedBy: dbUpdatedBy,
  }

  return {
    outboundCarrier: resolvedOutbound,
    returnCarrier: resolvedReturn,
    updatedAt: dbUpdatedAt,
    updatedBy: dbUpdatedBy,
    envStatus: getCarrierEnvironmentStatus(),
  }
}

/**
 * Synchronous version for use in non-async contexts (factory resolution).
 * Uses the synchronized in-process cache with env var fallbacks.
 */
export function getCarrierSettingsSync(): CarrierSettings {
  const envOutbound = process.env.OUTBOUND_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER
  const envReturn = process.env.RETURN_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER
  return {
    outboundCarrier: (_devCache.outboundCarrier || envOutbound || 'MOCK') as ShippingProviderType,
    returnCarrier: (_devCache.returnCarrier || envReturn || 'MOCK') as ShippingProviderType,
    updatedAt: _devCache.updatedAt,
    updatedBy: _devCache.updatedBy,
    envStatus: getCarrierEnvironmentStatus(),
  }
}

/**
 * Persists carrier settings to DB Setting table.
 * Called from admin UI via API route — credentials are NEVER stored here,
 * only the provider selection key.
 */
export async function updateCarrierSettings(newSettings: {
  outboundCarrier?: ShippingProviderType
  returnCarrier?: ShippingProviderType
  updatedBy?: string
}): Promise<CarrierSettings> {
  const validCarriers: ShippingProviderType[] = ['SURAT', 'YURTICI', 'MOCK']

  if (newSettings.outboundCarrier && !validCarriers.includes(newSettings.outboundCarrier)) {
    throw new Error(`Geçersiz gönderi kargo firması: ${newSettings.outboundCarrier}`)
  }
  if (newSettings.returnCarrier && !validCarriers.includes(newSettings.returnCarrier)) {
    throw new Error(`Geçersiz iade kargo firması: ${newSettings.returnCarrier}`)
  }

  const current = await getCarrierSettings()
  const next: CarrierSettings = {
    outboundCarrier: newSettings.outboundCarrier ?? current.outboundCarrier,
    returnCarrier: newSettings.returnCarrier ?? current.returnCarrier,
    updatedAt: new Date().toISOString(),
    updatedBy: newSettings.updatedBy || 'admin',
    envStatus: getCarrierEnvironmentStatus(),
  }

  // Update in-memory cache
  _devCache = next

  if (isDatabaseConfigured) {
    try {
      if (newSettings.outboundCarrier) {
        await (db.orm.public.Setting as any).upsert({
          where: { key: SETTING_KEY_OUTBOUND },
          create: {
            key: SETTING_KEY_OUTBOUND,
            value: newSettings.outboundCarrier,
            type: 'string',
            group: 'shipping',
            label: 'Aktif Gönderi Kargo Firması',
          },
          update: { value: newSettings.outboundCarrier },
        })
      }

      if (newSettings.returnCarrier) {
        await (db.orm.public.Setting as any).upsert({
          where: { key: SETTING_KEY_RETURN },
          create: {
            key: SETTING_KEY_RETURN,
            value: newSettings.returnCarrier,
            type: 'string',
            group: 'shipping',
            label: 'Aktif İade Kargo Firması',
          },
          update: { value: newSettings.returnCarrier },
        })
      }
    } catch (err) {
      console.warn('[shipping-settings] DB write failed, settings cached in memory only:', err)
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
  }

  return next
}
