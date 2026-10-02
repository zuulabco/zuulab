import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'

export interface StoreSettings {
  storeName: string
  storeEmail: string
  storePhone: string
  storeAddress: string
  currency: string
  taxRate: number
  freeShippingThreshold: number
  orderPrefix: string
  allowCustomerCancellation: boolean
  updatedAt?: string
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
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

const SETTING_KEY_STORE_SETTINGS = 'store.settings'
const SETTING_KEY_FREE_SHIPPING_THRESHOLD = 'store.free_shipping_threshold'

// In-process memory cache for fast access across request lifecycles
let _cachedStoreSettings: StoreSettings = { ...DEFAULT_STORE_SETTINGS }
let _isCached = false

/**
 * Parses freeShippingThreshold safely without falsy 0 bug.
 * Returns null if not valid.
 */
export function parseFreeShippingThreshold(val: any): number | null {
  if (val === null || val === undefined || val === '') return null
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isNaN(num) || num < 0) return null
  return num
}

/**
 * Retrieves store settings from PostgreSQL 'settings' table with fallback.
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  if (isDatabaseConfigured) {
    try {
      const [settingsRec, thresholdRec] = await Promise.all([
        (db.orm.public.Setting as any).where({ key: SETTING_KEY_STORE_SETTINGS }).first(),
        (db.orm.public.Setting as any).where({ key: SETTING_KEY_FREE_SHIPPING_THRESHOLD }).first(),
      ])

      let dbSettings: Partial<StoreSettings> = {}
      let thresholdOverride: number | null = null

      if (settingsRec?.value) {
        try {
          const parsed = JSON.parse(settingsRec.value)
          if (parsed && typeof parsed === 'object') {
            dbSettings = parsed
          }
        } catch (e) {
          console.warn('[store-settings] JSON parse error for store.settings:', e)
        }
      }

      if (thresholdRec?.value !== null && thresholdRec?.value !== undefined) {
        const parsedThreshold = parseFreeShippingThreshold(thresholdRec.value)
        if (parsedThreshold !== null) {
          thresholdOverride = parsedThreshold
        }
      }

      // Safe threshold parsing: 0 must be preserved!
      const rawThreshold = thresholdOverride !== null 
        ? thresholdOverride 
        : parseFreeShippingThreshold(dbSettings.freeShippingThreshold)
      
      const freeShippingThreshold = rawThreshold !== null ? rawThreshold : DEFAULT_STORE_SETTINGS.freeShippingThreshold

      const merged: StoreSettings = {
        storeName: dbSettings.storeName ?? DEFAULT_STORE_SETTINGS.storeName,
        storeEmail: dbSettings.storeEmail ?? DEFAULT_STORE_SETTINGS.storeEmail,
        storePhone: dbSettings.storePhone ?? DEFAULT_STORE_SETTINGS.storePhone,
        storeAddress: dbSettings.storeAddress ?? DEFAULT_STORE_SETTINGS.storeAddress,
        currency: dbSettings.currency ?? DEFAULT_STORE_SETTINGS.currency,
        taxRate: typeof dbSettings.taxRate === 'number' ? dbSettings.taxRate : DEFAULT_STORE_SETTINGS.taxRate,
        freeShippingThreshold,
        orderPrefix: dbSettings.orderPrefix ?? DEFAULT_STORE_SETTINGS.orderPrefix,
        allowCustomerCancellation: dbSettings.allowCustomerCancellation ?? DEFAULT_STORE_SETTINGS.allowCustomerCancellation,
        updatedAt: (dbSettings as any).updatedAt,
      }

      _cachedStoreSettings = merged
      _isCached = true
      return merged
    } catch (err) {
      console.warn('[store-settings] Failed to read settings from DB, using cache/defaults:', err)
    }
  }

  return _isCached ? _cachedStoreSettings : { ...DEFAULT_STORE_SETTINGS }
}

/**
 * Returns the authoritative free shipping threshold (in TL).
 * Preserves 0 as a valid threshold!
 */
export async function getFreeShippingThreshold(): Promise<number> {
  const settings = await getStoreSettings()
  return settings.freeShippingThreshold
}

/**
 * Synchronous cached free shipping threshold accessor for client / non-async contexts.
 */
export function getCachedFreeShippingThreshold(): number {
  return _cachedStoreSettings.freeShippingThreshold
}

/**
 * Updates store settings in PostgreSQL 'settings' table and refreshes in-memory cache.
 */
export async function updateStoreSettings(
  partial: Partial<StoreSettings>,
  adminEmail = 'system'
): Promise<StoreSettings> {
  const current = await getStoreSettings()

  const safeThreshold = parseFreeShippingThreshold(partial.freeShippingThreshold)
  const freeShippingThreshold = safeThreshold !== null ? safeThreshold : current.freeShippingThreshold

  const updated: StoreSettings = {
    ...current,
    ...partial,
    freeShippingThreshold,
    taxRate: partial.taxRate !== undefined ? Number(partial.taxRate) : current.taxRate,
    updatedAt: new Date().toISOString(),
  }

  if (isDatabaseConfigured) {
    try {
      // 1. Upsert store.settings JSON
      const existingSettings = await (db.orm.public.Setting as any).where({ key: SETTING_KEY_STORE_SETTINGS }).first()
      if (existingSettings) {
        await (db.orm.public.Setting as any).where({ key: SETTING_KEY_STORE_SETTINGS }).update({
          value: JSON.stringify(updated),
        })
      } else {
        await (db.orm.public.Setting as any).create({
          key: SETTING_KEY_STORE_SETTINGS,
          value: JSON.stringify(updated),
          type: 'json',
          group: 'store',
          label: 'Genel Mağaza ve Ticaret Ayarları',
        })
      }

      // 2. Upsert store.free_shipping_threshold dedicated key for fast direct lookup
      const existingThreshold = await (db.orm.public.Setting as any).where({ key: SETTING_KEY_FREE_SHIPPING_THRESHOLD }).first()
      if (existingThreshold) {
        await (db.orm.public.Setting as any).where({ key: SETTING_KEY_FREE_SHIPPING_THRESHOLD }).update({
          value: String(freeShippingThreshold),
        })
      } else {
        await (db.orm.public.Setting as any).create({
          key: SETTING_KEY_FREE_SHIPPING_THRESHOLD,
          value: String(freeShippingThreshold),
          type: 'number',
          group: 'shipping',
          label: 'Ücretsiz Kargo Sepet Tutarı Eşiği (TL)',
        })
      }
    } catch (err) {
      console.error('[store-settings] Failed to save settings to DB:', err)
      throw new Error('Mağaza ayarları veritabanına kaydedilemedi.')
    }
  }

  _cachedStoreSettings = updated
  _isCached = true

  return updated
}
