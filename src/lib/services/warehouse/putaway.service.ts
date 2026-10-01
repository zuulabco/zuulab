import 'server-only'
import { logAuditEvent } from '@/lib/services/admin.service'
import { LocationService } from './location.service'
import { WarehouseScanService } from './warehouse-scan.service'
import {
  WarehouseValidationError,
  WarehouseInvalidStateError,
  WarehouseNotFoundError,
} from './warehouse-error'
import type {
  WarehouseLocationRecord,
  PutawayInput,
  PutawayScoreResult,
  InventoryLocationMovementRecord,
} from './warehouse-types'

export class PutawayService {
  /**
   * Deterministic Putaway Location Scoring Algorithm:
   *
   * Formula:
   * score = skuAffinity + capacityFit + zonePriority + pickFrequency + locationPriority - travelDistance
   *
   * Factors:
   * 1. skuAffinity (+50): Location already stores this identical SKU (consolidates same SKU together)
   * 2. capacityFit (0 to +30): Proportional to available capacity (encourages balanced filling)
   * 3. zonePriority (+15): Zone A preferred for active pickable goods, Zone B for bulk/accessories
   * 4. pickFrequency (+10): Ground / accessible shelf levels (e.g. S01, S02) favored over high shelves
   * 5. locationPriority (+5): Based on sortOrder
   * 6. travelDistance (penalty): Numerical aisle distance from packing station (Aisle 01 penalty = 1, Aisle 10 = 10)
   *
   * Completely deterministic: NO AI/LLM randomness. Identical inputs yield identical ranked outputs.
   */
  public static async scoreLocationsForProduct(input: {
    productId: string
    sku: string
    quantity: number
    warehouseId?: string
  }): Promise<PutawayScoreResult[]> {
    const warehouseId = input.warehouseId || 'MAIN'

    // Fetch all active BIN locations where putaway is allowed
    const eligibleLocations = await LocationService.listLocations({
      warehouseId,
      type: 'BIN',
      isActive: true,
      isPutawayAllowed: true,
    })

    const scoredResults: PutawayScoreResult[] = []

    for (const loc of eligibleLocations) {
      // Exclude Quarantine zone for standard product putaways
      if (loc.zone === 'QUARANTINE') {
        continue
      }

      const invs = await LocationService.getLocationInventory(loc.id)
      const currentOccupied = invs.reduce((sum, item) => sum + item.quantity, 0)
      const remainingCapacity = loc.capacity - currentOccupied

      // If location cannot fit the incoming batch, skip
      if (remainingCapacity < input.quantity) {
        continue
      }

      // Factor 1: SKU Affinity (+50)
      const hasSameSku = invs.some(
        (it) => it.sku.toUpperCase() === input.sku.toUpperCase() && it.quantity > 0
      )
      const skuAffinity = hasSameSku ? 50 : 0

      // Factor 2: Capacity Fit (0 to 30)
      const capacityRatio = loc.capacity > 0 ? remainingCapacity / loc.capacity : 0
      const capacityFit = Math.round(capacityRatio * 30)

      // Factor 3: Zone Priority (Zone A = +15, Zone B = +10, Other = +5)
      let zonePriority = 5
      if (loc.zone === 'A') zonePriority = 15
      else if (loc.zone === 'B') zonePriority = 10

      // Factor 4: Pick Frequency / Ergonomic Shelf Level
      // Lower shelves (S01, S02) are faster to pick from (+10) compared to high shelves (+5)
      let pickFrequency = 5
      if (loc.shelf === 'S01' || loc.shelf === '01' || loc.shelf === 'S02' || loc.shelf === '02') {
        pickFrequency = 10
      }

      // Factor 5: Location Priority from sortOrder
      const locationPriority = Math.min(10, Math.max(0, 10 - Math.floor(loc.sortOrder / 10)))

      // Factor 6: Travel Distance Penalty (Aisle distance from packing area)
      const aisleNum = loc.aisle ? parseInt(loc.aisle, 10) || 1 : 1
      const travelDistance = Math.min(20, aisleNum * 2)

      const totalScore =
        skuAffinity + capacityFit + zonePriority + pickFrequency + locationPriority - travelDistance

      scoredResults.push({
        location: loc,
        score: totalScore,
        breakdown: {
          skuAffinity,
          capacityFit,
          zonePriority,
          pickFrequency,
          locationPriority,
          travelDistance,
        },
      })
    }

    // Sort deterministically by descending score, then code
    return scoredResults.sort((a, b) => b.score - a.score || a.location.code.localeCompare(b.location.code))
  }

  /**
   * Suggests the best putaway location for an incoming batch.
   */
  public static async suggestPutawayLocation(input: {
    productId: string
    sku: string
    quantity: number
    warehouseId?: string
  }): Promise<PutawayScoreResult | null> {
    const scored = await this.scoreLocationsForProduct(input)
    return scored.length > 0 ? scored[0] : null
  }

  /**
   * Executes putaway into a physical warehouse location.
   * Invariants:
   * - Location must be active
   * - Location must have isPutawayAllowed = true
   * - Remaining capacity must accommodate the quantity
   * - Creates immutable InventoryLocationMovement record
   * - Strictly idempotent: repeated execution with identical referenceId/key does not double-putaway
   */
  public static async executePutaway(
    input: PutawayInput
  ): Promise<{ movement: InventoryLocationMovementRecord; idempotent: boolean }> {
    const warehouseId = input.warehouseId || 'MAIN'

    // Verify location
    const location = await LocationService.getLocation(input.locationId)
    if (!location.isActive) {
      throw new WarehouseInvalidStateError(`Lokasyon (#${location.code}) pasif durumdadır.`)
    }
    if (!location.isPutawayAllowed) {
      throw new WarehouseInvalidStateError(`Lokasyona (#${location.code}) yerleştirme yapılmasına izin verilmiyor.`)
    }

    // Check capacity
    const invs = await LocationService.getLocationInventory(location.id)
    const currentOccupied = invs.reduce((sum, it) => sum + it.quantity, 0)
    if (currentOccupied + input.quantity > location.capacity) {
      throw new WarehouseValidationError(
        `Lokasyon (#${location.code}) kapasitesi aşıldı! Kapasite: ${location.capacity}, Mevcut: ${currentOccupied}, Eklenecek: ${input.quantity}`
      )
    }

    const sku = input.sku || input.productId
    const refId = input.referenceId || `ref_${Date.now()}`
    const idempotencyKey =
      input.idempotencyKey || `PUTAWAY:${input.productId}:${location.id}:${refId}`

    const result = await LocationService.recordMovement({
      warehouseId,
      movementType: 'PUTAWAY',
      sourceLocationId: null, // Initial putaway into warehouse has no source location
      destinationLocationId: location.id,
      productId: input.productId,
      sku,
      quantity: input.quantity,
      operatorId: input.operatorId,
      referenceId: refId,
      idempotencyKey,
      notes: input.notes || `Kabul yerleştirme (#${location.code})`,
    })

    if (!result.idempotent) {
      await logAuditEvent({
        action: 'warehouse.putaway.created',
        entity: 'WarehouseLocation',
        entityId: location.id,
        userId: input.operatorId,
        metadata: {
          locationCode: location.code,
          productId: input.productId,
          sku,
          quantity: input.quantity,
          referenceId: refId,
        },
      }).catch(() => {})
    }

    return result
  }

  /**
   * Moves stock between two physical warehouse locations (Relocation).
   */
  public static async executeRelocation(input: {
    warehouseId?: string
    sourceLocationId: string
    destinationLocationId: string
    productId: string
    sku: string
    quantity: number
    operatorId: string
    referenceId?: string
    idempotencyKey?: string
    notes?: string
  }): Promise<{ movement: InventoryLocationMovementRecord; idempotent: boolean }> {
    const warehouseId = input.warehouseId || 'MAIN'
    const refId = input.referenceId || `reloc_${Date.now()}`
    const idempotencyKey =
      input.idempotencyKey ||
      `RELOCATION:${input.productId}:${input.sourceLocationId}:${input.destinationLocationId}:${refId}`

    return await LocationService.recordMovement({
      warehouseId,
      movementType: 'RELOCATION',
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      productId: input.productId,
      sku: input.sku,
      quantity: input.quantity,
      operatorId: input.operatorId,
      referenceId: refId,
      idempotencyKey,
      notes: input.notes || 'Depo içi lokasyon transferi',
    })
  }
}
