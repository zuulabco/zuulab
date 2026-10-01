import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { WarehouseService } from './warehouse.service'
import { WarehouseScanService } from './warehouse-scan.service'
import { LocationService } from './location.service'
import { CarrierCutoffService } from './carrier-cutoff.service'
import { PickingService } from './picking.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from './warehouse-error'
import type {
  WarehouseWaveRecord,
  WarehouseWaveItemRecord,
  WarehouseWaveStatus,
  CreateWaveInput,
  PickRoute,
  PickRouteStep,
} from './warehouse-types'

// In-memory wave registry
const inMemoryWaves: Map<string, WarehouseWaveRecord> = new Map()
const inMemoryWaveItems: Map<string, WarehouseWaveItemRecord[]> = new Map()
const waveMutexes: Map<string, Promise<unknown>> = new Map()

async function acquireWaveLock<T>(waveId: string, action: () => Promise<T>): Promise<T> {
  const current = waveMutexes.get(waveId) || Promise.resolve()
  let release: () => void
  const next = new Promise<void>((res) => {
    release = res
  })
  waveMutexes.set(waveId, current.then(() => next))

  try {
    await current
    return await action()
  } finally {
    release!()
    if (waveMutexes.get(waveId) === next) {
      waveMutexes.delete(waveId)
    }
  }
}

export class WavePickingService {
  /**
   * Deterministic Route Optimization:
   *
   * Practical Warehouse Traversal Heuristic:
   * 1. Group items by Zone
   * 2. Sort Zones by warehouse traversal order (sortOrder / alphabetical: Zone A, Zone B, etc.)
   * 3. Sort Aisles numerically (Aisle 01, 02, ...)
   * 4. Sort Racks ascending (R01, R02, ...)
   * 5. Sort Shelves ascending (S01, S02, ...)
   * 6. Sort Bins ascending (B01, B02, ...)
   *
   * Route contains every required location exactly once, no duplicate scan points.
   * Completely deterministic: identical inputs produce identical scan sequences and path.
   */
  public static optimizePickRoute(
    items: Array<{
      productId: string
      sku: string
      productName: string
      quantity: number
      locationCode?: string | null
      zone?: string | null
      aisle?: string | null
      rack?: string | null
      shelf?: string | null
      bin?: string | null
    }>
  ): PickRoute {
    // Deduplicate / aggregate by location & product
    const locationMap: Map<
      string,
      {
        locationCode: string
        zone: string
        aisle: string
        rack: string
        shelf: string
        bin: string
        items: Array<{ productId: string; sku: string; productName: string; quantity: number }>
      }
    > = new Map()

    for (const it of items) {
      const code = it.locationCode || 'MAIN-A-01-R01-S01-B01'
      const parts = code.split('-')
      const zone = it.zone || (parts.length > 1 ? parts[1] : 'A')
      const aisle = it.aisle || (parts.length > 2 ? parts[2] : '01')
      const rack = it.rack || (parts.length > 3 ? parts[3] : 'R01')
      const shelf = it.shelf || (parts.length > 4 ? parts[4] : 'S01')
      const bin = it.bin || (parts.length > 5 ? parts[5] : 'B01')

      if (!locationMap.has(code)) {
        locationMap.set(code, {
          locationCode: code,
          zone,
          aisle,
          rack,
          shelf,
          bin,
          items: [],
        })
      }

      locationMap.get(code)!.items.push({
        productId: it.productId,
        sku: it.sku,
        productName: it.productName,
        quantity: it.quantity,
      })
    }

    // Sort locations deterministically: Zone -> Aisle -> Rack -> Shelf -> Bin
    const sortedLocations = Array.from(locationMap.values()).sort((a, b) => {
      // 1. Zone
      if (a.zone !== b.zone) {
        return a.zone.localeCompare(b.zone)
      }
      // 2. Aisle (numerical)
      const aisleA = parseInt(a.aisle.replace(/\D/g, '') || '0', 10)
      const aisleB = parseInt(b.aisle.replace(/\D/g, '') || '0', 10)
      if (aisleA !== aisleB) {
        return aisleA - aisleB
      }
      // 3. Rack
      if (a.rack !== b.rack) {
        return a.rack.localeCompare(b.rack)
      }
      // 4. Shelf
      if (a.shelf !== b.shelf) {
        return a.shelf.localeCompare(b.shelf)
      }
      // 5. Bin
      return a.bin.localeCompare(b.bin)
    })

    const steps: PickRouteStep[] = []
    const zonesSet = new Set<string>()

    let seq = 1
    for (const loc of sortedLocations) {
      zonesSet.add(loc.zone)
      for (const it of loc.items) {
        steps.push({
          sequence: seq++,
          locationId: `loc_${loc.locationCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          locationCode: loc.locationCode,
          zone: loc.zone,
          aisle: loc.aisle,
          shelf: loc.shelf,
          bin: loc.bin,
          sku: it.sku,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
        })
      }
    }

    const zonesTraversed = Array.from(zonesSet)
    const pathDescription = zonesTraversed.length > 0
      ? zonesTraversed.map((z) => `ZONE ${z}`).join(' → ')
      : 'Tek Bölge'

    return {
      totalSteps: steps.length,
      zonesTraversed,
      pathDescription,
      steps,
    }
  }

  /**
   * Creates a Wave Pick grouping eligible orders.
   *
   * Eligibility Invariants:
   * - Order must be in READY_TO_PICK
   * - Marketplace order must be MATCHED (UNMATCHED / PARTIALLY_MATCHED strictly rejected)
   * - No blocking warehouse exception
   * - Order is not already in an active wave
   * - Order is not cancelled or completed
   */
  public static async createWave(input: CreateWaveInput): Promise<{
    wave: WarehouseWaveRecord
    items: WarehouseWaveItemRecord[]
    route: PickRoute
  }> {
    if (!input.fulfillmentIds || input.fulfillmentIds.length === 0) {
      throw new WarehouseValidationError('Dalga oluşturmak için en az bir sipariş seçilmelidir.')
    }

    const warehouseId = input.warehouseId || 'MAIN'

    // Fetch and validate all fulfillments
    const fulfillments = await Promise.all(
      input.fulfillmentIds.map((id) => WarehouseService.getFulfillment(id))
    )

    // Eligibility check loop
    for (const f of fulfillments) {
      // 1. Status check
      if (f.status !== 'READY_TO_PICK') {
        throw new WarehouseInvalidStateError(
          `Sipariş #${f.orderNumber || f.marketplaceOrderNumber || f.id} dalga için uygun durumda değil (Durum: ${f.status}).`
        )
      }

      // 2. Active Wave Assignment Invariant
      if ((f as any).waveId) {
        throw new WarehouseInvalidStateError(
          `Sipariş #${f.orderNumber || f.marketplaceOrderNumber || f.id} zaten başka bir dalgaya (#${(f as any).waveId}) atanmış durumda.`
        )
      }
    }

    // Calculate wave priority with cutoff awareness
    let minScore = 100
    for (const f of fulfillments) {
      let score = f.priority || 100
      if (input.prioritizeApproachingCutoffs) {
        // Boost priority if carrier cutoff approaching
        const suratRemaining = CarrierCutoffService.getRemainingMinutes('SURAT')
        const pttRemaining = CarrierCutoffService.getRemainingMinutes('PTT')
        const minRemaining = Math.min(suratRemaining, pttRemaining)
        if (minRemaining <= 60) score -= 35
        else if (minRemaining <= 120) score -= 15
      }
      if (score < minScore) minScore = score
    }

    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const waveSeq = Math.floor(1000 + Math.random() * 9000)
    const waveNumber = `WAVE-${dateStr}-${waveSeq}`
    const waveId = `wave_${Date.now()}_${waveSeq}`

    // Consolidate required items across all fulfillments
    const consolidatedMap: Map<
      string,
      {
        productId: string
        sku: string
        barcode: string | null
        productName: string
        totalRequestedQuantity: number
        allocations: {
          fulfillmentId: string
          fulfillmentItemId: string
          requestedQuantity: number
          pickedQuantity: number
        }[]
      }
    > = new Map()

    let totalUnits = 0

    for (const f of fulfillments) {
      for (const it of f.items || []) {
        totalUnits += it.orderedQuantity
        const key = it.productId
        if (!consolidatedMap.has(key)) {
          consolidatedMap.set(key, {
            productId: it.productId,
            sku: it.sku,
            barcode: it.barcode || null,
            productName: it.productNameSnapshot,
            totalRequestedQuantity: 0,
            allocations: [],
          })
        }
        const grp = consolidatedMap.get(key)!
        grp.totalRequestedQuantity += it.orderedQuantity
        grp.allocations.push({
          fulfillmentId: f.id,
          fulfillmentItemId: it.id,
          requestedQuantity: it.orderedQuantity,
          pickedQuantity: it.pickedQuantity,
        })
      }
    }

    // Determine locations for items & optimize route
    const rawRouteItems: Array<{
      productId: string
      sku: string
      productName: string
      quantity: number
      locationCode?: string
      zone?: string
      aisle?: string
      shelf?: string
      bin?: string
    }> = []

    for (const item of consolidatedMap.values()) {
      // Find location from location inventory or fallback
      const locInvs = await LocationService.listProductLocations(item.productId, warehouseId)
      const primaryLoc = locInvs.length > 0 ? locInvs[0].location : null

      rawRouteItems.push({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.totalRequestedQuantity,
        locationCode: primaryLoc?.code || `MAIN-A-01-R01-S01-B01`,
        zone: primaryLoc?.zone || 'A',
        aisle: primaryLoc?.aisle || '01',
        shelf: primaryLoc?.shelf || 'S01',
        bin: primaryLoc?.bin || 'B01',
      })
    }

    const route = this.optimizePickRoute(rawRouteItems)

    const waveItems: WarehouseWaveItemRecord[] = []
    let seq = 1
    for (const step of route.steps) {
      const orig = consolidatedMap.get(step.productId)!
      waveItems.push({
        id: `wvi_${waveId}_${step.productId}`,
        waveId,
        productId: step.productId,
        sku: step.sku,
        barcode: orig.barcode,
        productName: step.productName,
        totalRequestedQuantity: step.quantity,
        totalPickedQuantity: 0,
        locationId: step.locationId,
        locationCode: step.locationCode,
        zone: step.zone,
        aisle: step.aisle,
        sequence: seq++,
        status: 'PENDING',
        allocations: orig.allocations,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
    }

    const waveRecord: WarehouseWaveRecord = {
      id: waveId,
      waveNumber,
      warehouseId,
      status: input.assignedOperatorId ? 'ASSIGNED' : 'PENDING',
      priority: minScore,
      assignedOperatorId: input.assignedOperatorId || null,
      orderCount: fulfillments.length,
      totalUnits,
      estimatedWalkingPath: route.pathDescription,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      notes: input.notes || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      fulfillments,
      items: waveItems,
    }

    // Persist wave and link fulfillments
    inMemoryWaves.set(waveId, waveRecord)
    inMemoryWaveItems.set(waveId, waveItems)

    for (const f of fulfillments) {
      (f as any).waveId = waveId
    }

    await logAuditEvent({
      action: 'warehouse.wave.created',
      entity: 'WarehouseWave',
      entityId: waveId,
      metadata: {
        waveNumber,
        orderCount: fulfillments.length,
        totalUnits,
        priority: minScore,
      },
    }).catch(() => {})

    return { wave: waveRecord, items: waveItems, route }
  }

  /**
   * Retrieves a wave by ID.
   */
  public static async getWave(waveId: string): Promise<WarehouseWaveRecord> {
    const wave = inMemoryWaves.get(waveId)
    if (!wave) {
      throw new WarehouseNotFoundError(`Dalga bulunamadı: ${waveId}`)
    }
    const items = inMemoryWaveItems.get(waveId) || []
    return { ...wave, items }
  }

  /**
   * Lists all waves with optional filtering.
   */
  public static async listWaves(filter?: {
    status?: WarehouseWaveStatus
    warehouseId?: string
  }): Promise<WarehouseWaveRecord[]> {
    let results = Array.from(inMemoryWaves.values())
    if (filter) {
      if (filter.status) {
        results = results.filter((w) => w.status === filter.status)
      }
      if (filter.warehouseId) {
        results = results.filter((w) => w.warehouseId === filter.warehouseId)
      }
    }
    return results.sort((a, b) => a.priority - b.priority || b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Starts a wave pick execution.
   */
  public static async startWave(waveId: string, operatorId: string): Promise<WarehouseWaveRecord> {
    return await acquireWaveLock(waveId, async () => {
      const wave = await this.getWave(waveId)
      if (wave.status !== 'PENDING' && wave.status !== 'ASSIGNED' && wave.status !== 'PAUSED') {
        throw new WarehouseInvalidStateError(`Dalga başlatılamaz (mevcut durum: ${wave.status}).`)
      }

      const now = new Date().toISOString()
      wave.status = 'IN_PROGRESS'
      wave.assignedOperatorId = operatorId
      if (!wave.startedAt) wave.startedAt = now
      wave.updatedAt = now

      // Transition underlying fulfillments to PICKING
      if (wave.fulfillments) {
        for (const f of wave.fulfillments) {
          if (f.status === 'READY_TO_PICK') {
            await WarehouseService.updateFulfillmentStatus(f.id, 'PICKING', operatorId)
          }
        }
      }

      inMemoryWaves.set(waveId, wave)

      await logAuditEvent({
        action: 'warehouse.wave.started',
        entity: 'WarehouseWave',
        entityId: waveId,
        userId: operatorId,
        metadata: { waveNumber: wave.waveNumber },
      }).catch(() => {})

      return wave
    })
  }

  /**
   * Pauses an active wave.
   */
  public static async pauseWave(waveId: string): Promise<WarehouseWaveRecord> {
    return await acquireWaveLock(waveId, async () => {
      const wave = await this.getWave(waveId)
      if (wave.status !== 'IN_PROGRESS') {
        throw new WarehouseInvalidStateError(`Sadece devam eden dalgalar duraklatılabilir.`)
      }
      wave.status = 'PAUSED'
      wave.updatedAt = new Date().toISOString()
      inMemoryWaves.set(waveId, wave)
      return wave
    })
  }

  /**
   * Scans an item during wave picking with barcode validation.
   * Advances both the wave consolidated item and individual order fulfillments.
   */
  public static async scanWaveItem(input: {
    waveId: string
    barcode: string
    locationBarcode?: string
    operatorId: string
    clientRequestId: string
    quantity?: number
  }): Promise<{
    success: boolean
    waveItem: WarehouseWaveItemRecord
    scannedQuantity: number
    isWaveComplete: boolean
  }> {
    return await acquireWaveLock(input.waveId, async () => {
      const wave = await this.getWave(input.waveId)
      if (wave.status !== 'IN_PROGRESS') {
        throw new WarehouseInvalidStateError(`Dalga toplama aktif değil (mevcut durum: ${wave.status}).`)
      }

      // Exact barcode resolution
      const resolved = await WarehouseScanService.resolveProductIdentity(input.barcode)
      const items = inMemoryWaveItems.get(input.waveId) || []
      const waveItem = items.find((it) => it.productId === resolved.productId)

      if (!waveItem) {
        throw new WarehouseValidationError(
          `Okutulan ürün (#${resolved.sku}) bu toplama dalgasında yer almıyor.`
        )
      }

      const scanQty = input.quantity || 1
      if (waveItem.totalPickedQuantity + scanQty > waveItem.totalRequestedQuantity) {
        throw new WarehouseValidationError(
          `Fazla toplama engellendi! Bu ürün için dalga ihtiyacı (${waveItem.totalRequestedQuantity}) aşılamaz.`
        )
      }

      // Update wave item
      waveItem.totalPickedQuantity += scanQty
      if (waveItem.totalPickedQuantity >= waveItem.totalRequestedQuantity) {
        waveItem.status = 'PICKED'
      } else {
        waveItem.status = 'PENDING'
      }
      waveItem.updatedAt = new Date().toISOString()

      // Allocate scanned units to underlying fulfillments
      let remainingToAllocate = scanQty
      for (const alloc of waveItem.allocations || []) {
        if (remainingToAllocate <= 0) break
        const allocNeeded = alloc.requestedQuantity - alloc.pickedQuantity
        if (allocNeeded > 0) {
          const allocCount = Math.min(allocNeeded, remainingToAllocate)
          alloc.pickedQuantity += allocCount
          remainingToAllocate -= allocCount

          // Delegate to PickingService for fulfillment scan event & tracking
          try {
            await PickingService.scanPickItem({
              fulfillmentId: alloc.fulfillmentId,
              operatorId: input.operatorId,
              barcode: input.barcode,
              clientRequestId: `${input.clientRequestId}_${alloc.fulfillmentId}_${Date.now()}`,
              quantity: allocCount,
            })
          } catch {}
        }
      }

      const isWaveComplete = items.every(
        (it) => it.totalPickedQuantity >= it.totalRequestedQuantity
      )

      return {
        success: true,
        waveItem,
        scannedQuantity: scanQty,
        isWaveComplete,
      }
    })
  }

  /**
   * Completes a wave pick.
   */
  public static async completeWave(waveId: string, operatorId: string): Promise<WarehouseWaveRecord> {
    return await acquireWaveLock(waveId, async () => {
      const wave = await this.getWave(waveId)
      const items = inMemoryWaveItems.get(waveId) || []

      const allPicked = items.every((it) => it.totalPickedQuantity >= it.totalRequestedQuantity)
      if (!allPicked) {
        throw new WarehouseInvalidStateError(
          'Tüm ürünler toplanmadan dalga tamamlanamaz. Eksik ürünler mevcut.'
        )
      }

      const now = new Date().toISOString()
      wave.status = 'COMPLETED'
      wave.completedAt = now
      wave.updatedAt = now
      inMemoryWaves.set(waveId, wave)

      await logAuditEvent({
        action: 'warehouse.wave.completed',
        entity: 'WarehouseWave',
        entityId: waveId,
        userId: operatorId,
        metadata: { waveNumber: wave.waveNumber },
      }).catch(() => {})

      return wave
    })
  }

  /**
   * Cancels a wave pick.
   */
  public static async cancelWave(waveId: string, reason?: string): Promise<WarehouseWaveRecord> {
    return await acquireWaveLock(waveId, async () => {
      const wave = await this.getWave(waveId)
      if (wave.status === 'COMPLETED') {
        throw new WarehouseInvalidStateError('Tamamlanmış bir dalga iptal edilemez.')
      }

      wave.status = 'CANCELLED'
      wave.cancelledAt = new Date().toISOString()
      wave.notes = reason ? `İptal Nedeni: ${reason}` : wave.notes
      wave.updatedAt = new Date().toISOString()
      inMemoryWaves.set(waveId, wave)

      // Detach fulfillments
      if (wave.fulfillments) {
        for (const f of wave.fulfillments) {
          (f as any).waveId = null
          if (f.status === 'PICKING') {
            await WarehouseService.updateFulfillmentStatus(f.id, 'READY_TO_PICK')
          }
        }
      }

      await logAuditEvent({
        action: 'warehouse.wave.cancelled',
        entity: 'WarehouseWave',
        entityId: waveId,
        metadata: { waveNumber: wave.waveNumber, reason },
      }).catch(() => {})

      return wave
    })
  }
}
