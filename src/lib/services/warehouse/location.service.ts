import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { getInventoryStatus } from '@/lib/services/inventory.service'
import { WarehouseExceptionService } from './exception.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
} from './warehouse-error'
import type {
  WarehouseLocationRecord,
  WarehouseLocationType,
  LocationInventoryRecord,
  InventoryLocationMovementRecord,
  InventoryLocationMovementType,
  CreateLocationInput,
} from './warehouse-types'

// In-memory data structures for fast execution, tests & DB fallback
const inMemoryLocations: Map<string, WarehouseLocationRecord> = new Map()
const inMemoryLocationInventories: Map<string, LocationInventoryRecord> = new Map()
const inMemoryMovements: Map<string, InventoryLocationMovementRecord> = new Map()
const inMemoryMovementIdempotencyKeys: Set<string> = new Set()

// Mutex per location to ensure concurrency safety
const locationLocks: Map<string, Promise<unknown>> = new Map()

async function acquireLocationLock<T>(locationId: string, task: () => Promise<T>): Promise<T> {
  const current = locationLocks.get(locationId) || Promise.resolve()
  let release: () => void
  const next = new Promise<void>((res) => {
    release = res
  })
  locationLocks.set(locationId, current.then(() => next))

  try {
    await current
    return await task()
  } finally {
    release!()
    if (locationLocks.get(locationId) === next) {
      locationLocks.delete(locationId)
    }
  }
}

// Default standard warehouse locations initialization
function ensureStandardDefaultLocations() {
  if (inMemoryLocations.size === 0) {
    const now = new Date().toISOString()

    // 1. Root Warehouse
    const wh: WarehouseLocationRecord = {
      id: 'loc_wh_main',
      warehouseId: 'MAIN',
      parentId: null,
      code: 'MAIN',
      name: 'Ana Depo (Merkez)',
      type: 'WAREHOUSE',
      zone: null,
      aisle: null,
      rack: null,
      shelf: null,
      bin: null,
      capacity: 100000,
      weightCapacityGrams: 50000000,
      isActive: true,
      isPickable: false,
      isPutawayAllowed: false,
      sortOrder: 0,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(wh.id, wh)

    // 2. Zones
    const zoneA: WarehouseLocationRecord = {
      id: 'loc_zone_a',
      warehouseId: 'MAIN',
      parentId: wh.id,
      code: 'MAIN-ZONE-A',
      name: 'Bölge A - Hızlı Tüketim & Elektronik',
      type: 'ZONE',
      zone: 'A',
      aisle: null,
      rack: null,
      shelf: null,
      bin: null,
      capacity: 20000,
      weightCapacityGrams: 10000000,
      isActive: true,
      isPickable: true,
      isPutawayAllowed: true,
      sortOrder: 10,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(zoneA.id, zoneA)

    const zoneB: WarehouseLocationRecord = {
      id: 'loc_zone_b',
      warehouseId: 'MAIN',
      parentId: wh.id,
      code: 'MAIN-ZONE-B',
      name: 'Bölge B - Aksesuar & Çevre Birimleri',
      type: 'ZONE',
      zone: 'B',
      aisle: null,
      rack: null,
      shelf: null,
      bin: null,
      capacity: 20000,
      weightCapacityGrams: 10000000,
      isActive: true,
      isPickable: true,
      isPutawayAllowed: true,
      sortOrder: 20,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(zoneB.id, zoneB)

    // Quarantine / Damage Zone
    const zoneQ: WarehouseLocationRecord = {
      id: 'loc_zone_q',
      warehouseId: 'MAIN',
      parentId: wh.id,
      code: 'MAIN-ZONE-QUARANTINE',
      name: 'Karantina & Hasarlı İnceleme Bölgesi',
      type: 'ZONE',
      zone: 'QUARANTINE',
      aisle: null,
      rack: null,
      shelf: null,
      bin: null,
      capacity: 5000,
      weightCapacityGrams: 5000000,
      isActive: true,
      isPickable: false,
      isPutawayAllowed: true,
      sortOrder: 90,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(zoneQ.id, zoneQ)

    // Standard Quarantine Bin
    const binQuarantine: WarehouseLocationRecord = {
      id: 'loc_bin_quarantine_01',
      warehouseId: 'MAIN',
      parentId: zoneQ.id,
      code: 'MAIN-QUARANTINE-01',
      name: 'Hasarlı / İade Karantina Gözü 01',
      type: 'BIN',
      zone: 'QUARANTINE',
      aisle: '01',
      rack: '01',
      shelf: '01',
      bin: '01',
      capacity: 500,
      weightCapacityGrams: 500000,
      isActive: true,
      isPickable: false,
      isPutawayAllowed: true,
      sortOrder: 91,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(binQuarantine.id, binQuarantine)

    // Standard Restock Bin in Zone A
    const binRestock: WarehouseLocationRecord = {
      id: 'loc_bin_restock_01',
      warehouseId: 'MAIN',
      parentId: zoneA.id,
      code: 'MAIN-A-RESTOCK-01',
      name: 'İade Kabul Restock Gözü A-01',
      type: 'BIN',
      zone: 'A',
      aisle: '01',
      rack: '01',
      shelf: '01',
      bin: '99',
      capacity: 1000,
      weightCapacityGrams: 1000000,
      isActive: true,
      isPickable: true,
      isPutawayAllowed: true,
      sortOrder: 99,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryLocations.set(binRestock.id, binRestock)
  }
}

// Initial seed
ensureStandardDefaultLocations()

export class LocationService {
  /**
   * Generates canonical standard warehouse location code:
   * Format: WAREHOUSE-ZONE-AISLE-RACK-SHELF-BIN
   * e.g. MAIN-A-03-R02-S04-B07
   */
  public static formatLocationCode(input: {
    warehousePrefix?: string
    zone?: string | null
    aisle?: string | null
    rack?: string | null
    shelf?: string | null
    bin?: string | null
  }): string {
    const parts: string[] = [input.warehousePrefix || 'MAIN']
    if (input.zone) parts.push(input.zone.toUpperCase())
    if (input.aisle) parts.push(input.aisle.padStart(2, '0'))
    if (input.rack) parts.push(input.rack.startsWith('R') ? input.rack : `R${input.rack.padStart(2, '0')}`)
    if (input.shelf) parts.push(input.shelf.startsWith('S') ? input.shelf : `S${input.shelf.padStart(2, '0')}`)
    if (input.bin) parts.push(input.bin.startsWith('B') ? input.bin : `B${input.bin.padStart(2, '0')}`)
    return parts.join('-')
  }

  /**
   * Creates a structured warehouse location.
   * Validates hierarchy constraints:
   * - Code uniqueness
   * - Parent existence and active status
   * - Inactive parent cannot have active children
   */
  public static async createLocation(input: CreateLocationInput): Promise<WarehouseLocationRecord> {
    ensureStandardDefaultLocations()

    const code = input.code.trim().toUpperCase()
    if (!code) {
      throw new WarehouseValidationError('Lokasyon kodu zorunludur.')
    }
    if (!input.name || !input.name.trim()) {
      throw new WarehouseValidationError('Lokasyon adı zorunludur.')
    }

    const warehouseId = input.warehouseId || 'MAIN'

    // Check code uniqueness
    const existing = await this.getLocationByCode(code, warehouseId)
    if (existing) {
      throw new WarehouseValidationError(`'${code}' kodlu lokasyon zaten mevcut.`)
    }

    // Validate parent hierarchy if parentId is specified
    if (input.parentId) {
      const parent = await this.getLocation(input.parentId)
      if (!parent.isActive && (input.isActive ?? true)) {
        throw new WarehouseValidationError('Pasif durumdaki bir lokasyon altına aktif alt lokasyon eklenemez.')
      }
    }

    const now = new Date().toISOString()
    const id = `loc_${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const record: WarehouseLocationRecord = {
      id,
      warehouseId,
      parentId: input.parentId || null,
      code,
      name: input.name.trim(),
      type: input.type,
      zone: input.zone?.trim().toUpperCase() || null,
      aisle: input.aisle?.trim() || null,
      rack: input.rack?.trim() || null,
      shelf: input.shelf?.trim() || null,
      bin: input.bin?.trim() || null,
      capacity: input.capacity !== undefined ? input.capacity : 100,
      weightCapacityGrams: input.weightCapacityGrams !== undefined ? input.weightCapacityGrams : null,
      isActive: input.isActive !== undefined ? input.isActive : true,
      isPickable: input.isPickable !== undefined ? input.isPickable : true,
      isPutawayAllowed: input.isPutawayAllowed !== undefined ? input.isPutawayAllowed : true,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : 0,
      metadata: input.metadata || null,
      createdAt: now,
      updatedAt: now,
    }

    // Save to memory
    inMemoryLocations.set(id, record)

    // Save to DB if configured
    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseLocation as any).create({
          data: {
            id,
            warehouseId,
            parentId: record.parentId,
            code: record.code,
            name: record.name,
            type: record.type,
            zone: record.zone,
            aisle: record.aisle,
            rack: record.rack,
            shelf: record.shelf,
            bin: record.bin,
            capacity: record.capacity,
            weightCapacityGrams: record.weightCapacityGrams,
            isActive: record.isActive,
            isPickable: record.isPickable,
            isPutawayAllowed: record.isPutawayAllowed,
            sortOrder: record.sortOrder,
            metadata: record.metadata,
          },
        })
      } catch (err) {
        console.warn('[LocationService] DB create location failed:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.location.created',
      entity: 'WarehouseLocation',
      entityId: id,
      metadata: { code: record.code, type: record.type, warehouseId },
    }).catch(() => {})

    return record
  }

  /**
   * Retrieves location by ID.
   */
  public static async getLocation(id: string): Promise<WarehouseLocationRecord> {
    ensureStandardDefaultLocations()

    const inMem = inMemoryLocations.get(id)
    if (inMem) return inMem

    if (isDatabaseConfigured) {
      try {
        const raw = await (db.orm.public.WarehouseLocation as any).where({ id }).first()
        if (raw) {
          const mapped: WarehouseLocationRecord = {
            id: raw.id,
            warehouseId: raw.warehouseId,
            parentId: raw.parentId,
            code: raw.code,
            name: raw.name,
            type: raw.type,
            zone: raw.zone,
            aisle: raw.aisle,
            rack: raw.rack,
            shelf: raw.shelf,
            bin: raw.bin,
            capacity: raw.capacity,
            weightCapacityGrams: raw.weightCapacityGrams ? Number(raw.weightCapacityGrams) : null,
            isActive: raw.isActive,
            isPickable: raw.isPickable,
            isPutawayAllowed: raw.isPutawayAllowed,
            sortOrder: raw.sortOrder,
            metadata: raw.metadata,
            createdAt: raw.createdAt.toISOString(),
            updatedAt: raw.updatedAt.toISOString(),
          }
          inMemoryLocations.set(mapped.id, mapped)
          return mapped
        }
      } catch (err) {
        console.warn('[LocationService] DB get location failed:', err)
      }
    }

    throw new WarehouseNotFoundError(`Lokasyon bulunamadı: ${id}`)
  }

  /**
   * Retrieves location by exact code.
   */
  public static async getLocationByCode(
    code: string,
    warehouseId = 'MAIN'
  ): Promise<WarehouseLocationRecord | null> {
    ensureStandardDefaultLocations()
    const norm = code.trim().toUpperCase()

    for (const loc of inMemoryLocations.values()) {
      if (loc.code === norm && loc.warehouseId === warehouseId) {
        return loc
      }
    }

    if (isDatabaseConfigured) {
      try {
        const raw = await (db.orm.public.WarehouseLocation as any)
          .where({ code: norm, warehouseId })
          .first()
        if (raw) {
          const mapped: WarehouseLocationRecord = {
            id: raw.id,
            warehouseId: raw.warehouseId,
            parentId: raw.parentId,
            code: raw.code,
            name: raw.name,
            type: raw.type,
            zone: raw.zone,
            aisle: raw.aisle,
            rack: raw.rack,
            shelf: raw.shelf,
            bin: raw.bin,
            capacity: raw.capacity,
            weightCapacityGrams: raw.weightCapacityGrams ? Number(raw.weightCapacityGrams) : null,
            isActive: raw.isActive,
            isPickable: raw.isPickable,
            isPutawayAllowed: raw.isPutawayAllowed,
            sortOrder: raw.sortOrder,
            metadata: raw.metadata,
            createdAt: raw.createdAt.toISOString(),
            updatedAt: raw.updatedAt.toISOString(),
          }
          inMemoryLocations.set(mapped.id, mapped)
          return mapped
        }
      } catch (err) {
        console.warn('[LocationService] DB get location by code failed:', err)
      }
    }

    return null
  }

  /**
   * Lists locations with flexible filtering.
   */
  public static async listLocations(filter?: {
    warehouseId?: string
    type?: WarehouseLocationType
    zone?: string
    isActive?: boolean
    isPickable?: boolean
    isPutawayAllowed?: boolean
  }): Promise<WarehouseLocationRecord[]> {
    ensureStandardDefaultLocations()

    let results = Array.from(inMemoryLocations.values())

    if (filter) {
      if (filter.warehouseId) {
        results = results.filter((l) => l.warehouseId === filter.warehouseId)
      }
      if (filter.type) {
        results = results.filter((l) => l.type === filter.type)
      }
      if (filter.zone) {
        const targetZone = filter.zone.toUpperCase()
        results = results.filter((l) => l.zone === targetZone)
      }
      if (filter.isActive !== undefined) {
        results = results.filter((l) => l.isActive === filter.isActive)
      }
      if (filter.isPickable !== undefined) {
        results = results.filter((l) => l.isPickable === filter.isPickable)
      }
      if (filter.isPutawayAllowed !== undefined) {
        results = results.filter((l) => l.isPutawayAllowed === filter.isPutawayAllowed)
      }
    }

    return results.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  }

  /**
   * Updates location attributes.
   */
  public static async updateLocation(
    id: string,
    updates: Partial<CreateLocationInput>
  ): Promise<WarehouseLocationRecord> {
    const loc = await this.getLocation(id)

    // Cannot point parentId to self
    if (updates.parentId && updates.parentId === id) {
      throw new WarehouseValidationError('Bir lokasyon kendisinin üst lokasyonu olamaz.')
    }

    const updated: WarehouseLocationRecord = {
      ...loc,
      name: updates.name ? updates.name.trim() : loc.name,
      isActive: updates.isActive !== undefined ? updates.isActive : loc.isActive,
      isPickable: updates.isPickable !== undefined ? updates.isPickable : loc.isPickable,
      isPutawayAllowed: updates.isPutawayAllowed !== undefined ? updates.isPutawayAllowed : loc.isPutawayAllowed,
      capacity: updates.capacity !== undefined ? updates.capacity : loc.capacity,
      weightCapacityGrams: updates.weightCapacityGrams !== undefined ? updates.weightCapacityGrams : loc.weightCapacityGrams,
      sortOrder: updates.sortOrder !== undefined ? updates.sortOrder : loc.sortOrder,
      metadata: updates.metadata !== undefined ? updates.metadata : loc.metadata,
      updatedAt: new Date().toISOString(),
    }

    inMemoryLocations.set(id, updated)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseLocation as any).where({ id }).update({
          name: updated.name,
          isActive: updated.isActive,
          isPickable: updated.isPickable,
          isPutawayAllowed: updated.isPutawayAllowed,
          capacity: updated.capacity,
          weightCapacityGrams: updated.weightCapacityGrams,
          sortOrder: updated.sortOrder,
          metadata: updated.metadata,
        })
      } catch (err) {
        console.warn('[LocationService] DB update location failed:', err)
      }
    }

    await logAuditEvent({
      action: updated.isActive ? 'warehouse.location.updated' : 'warehouse.location.deactivated',
      entity: 'WarehouseLocation',
      entityId: id,
      metadata: { code: updated.code, updates },
    }).catch(() => {})

    return updated
  }

  /**
   * Retrieves physical inventory projection at a given location.
   */
  public static async getLocationInventory(
    locationId: string,
    productId?: string
  ): Promise<LocationInventoryRecord[]> {
    ensureStandardDefaultLocations()

    const results: LocationInventoryRecord[] = []
    for (const inv of inMemoryLocationInventories.values()) {
      if (inv.locationId === locationId) {
        if (!productId || inv.productId === productId) {
          results.push(inv)
        }
      }
    }
    return results
  }

  /**
   * Lists all locations where a specific product is physically placed.
   */
  public static async listProductLocations(
    productId: string,
    warehouseId = 'MAIN'
  ): Promise<{ location: WarehouseLocationRecord; inventory: LocationInventoryRecord }[]> {
    ensureStandardDefaultLocations()

    const matched: { location: WarehouseLocationRecord; inventory: LocationInventoryRecord }[] = []
    for (const inv of inMemoryLocationInventories.values()) {
      if (inv.productId === productId && inv.warehouseId === warehouseId && inv.quantity > 0) {
        const loc = inMemoryLocations.get(inv.locationId)
        if (loc) {
          matched.push({ location: loc, inventory: inv })
        }
      }
    }
    return matched
  }

  /**
   * Records an immutable physical location movement.
   * Enforces:
   * 1. Idempotency (duplicate key returns existing record without moving twice)
   * 2. Non-negative quantity invariant (locationQuantity >= 0)
   * 3. Location active and capacity checks
   * 4. Updates physical location projection
   */
  public static async recordMovement(input: {
    warehouseId?: string
    movementType: InventoryLocationMovementType
    sourceLocationId?: string | null
    destinationLocationId?: string | null
    productId: string
    sku: string
    quantity: number
    operatorId: string
    referenceId?: string | null
    idempotencyKey?: string
    notes?: string | null
    metadata?: Record<string, unknown> | null
  }): Promise<{ movement: InventoryLocationMovementRecord; idempotent: boolean }> {
    ensureStandardDefaultLocations()

    if (input.quantity <= 0) {
      throw new WarehouseValidationError('Hareket miktarı 0 dan büyük olmalıdır.')
    }

    const warehouseId = input.warehouseId || 'MAIN'
    const idemKey =
      input.idempotencyKey ||
      `MOV:${warehouseId}:${input.movementType}:${input.sourceLocationId || 'NONE'}:${input.destinationLocationId || 'NONE'}:${input.productId}:${Date.now()}`

    // 1. Idempotency check
    if (inMemoryMovementIdempotencyKeys.has(idemKey)) {
      for (const m of inMemoryMovements.values()) {
        if (m.idempotencyKey === idemKey) {
          return { movement: m, idempotent: true }
        }
      }
    }

    // 2. Validate source location if present
    let sourceLoc: WarehouseLocationRecord | null = null
    if (input.sourceLocationId) {
      sourceLoc = await this.getLocation(input.sourceLocationId)
      if (!sourceLoc.isActive) {
        throw new WarehouseInvalidStateError(`Kaynak lokasyon (#${sourceLoc.code}) pasif durumda.`)
      }
    }

    // 3. Validate destination location if present
    let destLoc: WarehouseLocationRecord | null = null
    if (input.destinationLocationId) {
      destLoc = await this.getLocation(input.destinationLocationId)
      if (!destLoc.isActive) {
        throw new WarehouseInvalidStateError(`Hedef lokasyon (#${destLoc.code}) pasif durumda.`)
      }
    }

    // 4. Concurrency lock on involved locations
    const lockKey = `${input.sourceLocationId || 'none'}:${input.destinationLocationId || 'none'}:${input.productId}`

    return await acquireLocationLock(lockKey, async () => {
      // Re-check idempotency under lock
      if (inMemoryMovementIdempotencyKeys.has(idemKey)) {
        for (const m of inMemoryMovements.values()) {
          if (m.idempotencyKey === idemKey) {
            return { movement: m, idempotent: true }
          }
        }
      }

      // Check source inventory quantity
      const sourceInvKey = `${input.sourceLocationId}_${input.productId}`
      let sourceInv = inMemoryLocationInventories.get(sourceInvKey)

      if (input.sourceLocationId) {
        if (!sourceInv || sourceInv.quantity < input.quantity) {
          const avail = sourceInv ? sourceInv.quantity : 0
          throw new WarehouseValidationError(
            `Kaynak lokasyonda (#${sourceLoc?.code}) yetersiz miktar. Mevcut: ${avail}, Talep: ${input.quantity}`
          )
        }
      }

      // Check destination capacity
      if (input.destinationLocationId && destLoc) {
        const destInvs = await this.getLocationInventory(destLoc.id)
        const currentOccupied = destInvs.reduce((sum, it) => sum + it.quantity, 0)
        if (currentOccupied + input.quantity > destLoc.capacity) {
          throw new WarehouseValidationError(
            `Hedef lokasyon (#${destLoc.code}) kapasitesi aşıldı! Kapasite: ${destLoc.capacity}, Mevcut: ${currentOccupied}, Eklenecek: ${input.quantity}`
          )
        }
      }

      const now = new Date().toISOString()

      // Mutate source location inventory
      if (input.sourceLocationId && sourceInv) {
        sourceInv.quantity -= input.quantity
        // Invariant: locationQuantity >= 0
        if (sourceInv.quantity < 0) {
          sourceInv.quantity = 0
        }
        sourceInv.updatedAt = now
      }

      // Mutate destination location inventory
      if (input.destinationLocationId && destLoc) {
        const destInvKey = `${destLoc.id}_${input.productId}`
        let destInv = inMemoryLocationInventories.get(destInvKey)
        if (!destInv) {
          destInv = {
            id: `loc_inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            warehouseId,
            locationId: destLoc.id,
            productId: input.productId,
            sku: input.sku,
            quantity: 0,
            reservedQuantity: 0,
            lotNumber: null,
            batchInfo: null,
            createdAt: now,
            updatedAt: now,
          }
          inMemoryLocationInventories.set(destInvKey, destInv)
        }
        destInv.quantity += input.quantity
        destInv.updatedAt = now
      }

      // Create immutable movement record
      const movementId = `mov_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const movementRecord: InventoryLocationMovementRecord = {
        id: movementId,
        warehouseId,
        movementType: input.movementType,
        sourceLocationId: input.sourceLocationId || null,
        destinationLocationId: input.destinationLocationId || null,
        productId: input.productId,
        sku: input.sku,
        quantity: input.quantity,
        operatorId: input.operatorId,
        referenceId: input.referenceId || null,
        idempotencyKey: idemKey,
        notes: input.notes || null,
        metadata: input.metadata || null,
        createdAt: now,
      }

      inMemoryMovements.set(movementId, movementRecord)
      inMemoryMovementIdempotencyKeys.add(idemKey)

      await logAuditEvent({
        action: 'warehouse.location.moved',
        entity: 'InventoryLocationMovement',
        entityId: movementId,
        userId: input.operatorId,
        metadata: {
          movementType: input.movementType,
          sku: input.sku,
          quantity: input.quantity,
          sourceLocationId: input.sourceLocationId,
          destinationLocationId: input.destinationLocationId,
        },
      }).catch(() => {})

      return { movement: movementRecord, idempotent: false }
    })
  }

  /**
   * Reconciles sum of location quantities against central Phase 18 physical inventory.
   * INVARIANT: Does NOT silently mutate central inventory if mismatch occurs.
   * Creates a formal WarehouseException record instead.
   */
  public static async reconcileLocationInventory(
    productId: string,
    warehouseId = 'MAIN'
  ): Promise<{
    productId: string
    totalLocationQuantity: number
    centralPhysicalStock: number
    isReconciled: boolean
    difference: number
    exceptionId?: string
  }> {
    ensureStandardDefaultLocations()

    // 1. Calculate sum of location quantities
    let totalLocationQuantity = 0
    for (const inv of inMemoryLocationInventories.values()) {
      if (inv.productId === productId && inv.warehouseId === warehouseId) {
        totalLocationQuantity += inv.quantity
      }
    }

    // 2. Fetch central physical inventory status
    const centralStatus = await getInventoryStatus(productId)
    const centralPhysicalStock = centralStatus.stock

    const difference = totalLocationQuantity - centralPhysicalStock
    const isReconciled = difference === 0

    let exceptionId: string | undefined

    if (!isReconciled) {
      // Create warehouse exception for mismatch — NEVER silently overwrite central stock!
      try {
        const exc = await WarehouseExceptionService.createException({
          fulfillmentId: `reconcile_${productId}`,
          type: 'MISSING_ITEM',
          severity: Math.abs(difference) > 5 ? 'HIGH' : 'MEDIUM',
          description: `Depo lokasyon stoğu (${totalLocationQuantity}) ile merkezi fiziksel stok (${centralPhysicalStock}) arasında ${Math.abs(
            difference
          )} adet mutabakat farkı tespit edildi.`,
          createdBy: 'reconciliation-engine',
        })
        exceptionId = exc.id
      } catch {
        // Exception recording
      }
    }

    return {
      productId,
      totalLocationQuantity,
      centralPhysicalStock,
      isReconciled,
      difference,
      exceptionId,
    }
  }
}
