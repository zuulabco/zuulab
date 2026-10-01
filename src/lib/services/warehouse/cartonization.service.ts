import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
} from './warehouse-error'
import type {
  WarehouseCartonRecord,
  CartonizationItemInput,
  CartonPlacement,
  CartonizationResult,
  CreateCartonInput,
} from './warehouse-types'

// In-memory carton store
const inMemoryCartons: Map<string, WarehouseCartonRecord> = new Map()

function ensureDefaultCartons() {
  if (inMemoryCartons.size === 0) {
    const now = new Date().toISOString()
    const defaults: WarehouseCartonRecord[] = [
      {
        id: 'carton_xs',
        storeId: null,
        code: 'KOLI-XS',
        name: 'Ekstra Küçük Koli (XS)',
        innerLengthMm: 150,
        innerWidthMm: 100,
        innerHeightMm: 100,
        maxWeightGrams: 2000,
        tareWeightGrams: 100,
        active: true,
        priority: 10,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'carton_s',
        storeId: null,
        code: 'KOLI-S',
        name: 'Küçük Koli (S)',
        innerLengthMm: 250,
        innerWidthMm: 180,
        innerHeightMm: 120,
        maxWeightGrams: 5000,
        tareWeightGrams: 180,
        active: true,
        priority: 20,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'carton_m',
        storeId: null,
        code: 'KOLI-M',
        name: 'Orta Koli (M)',
        innerLengthMm: 350,
        innerWidthMm: 250,
        innerHeightMm: 200,
        maxWeightGrams: 12000,
        tareWeightGrams: 350,
        active: true,
        priority: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'carton_l',
        storeId: null,
        code: 'KOLI-L',
        name: 'Büyük Koli (L)',
        innerLengthMm: 450,
        innerWidthMm: 350,
        innerHeightMm: 300,
        maxWeightGrams: 20000,
        tareWeightGrams: 550,
        active: true,
        priority: 40,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'carton_xl',
        storeId: null,
        code: 'KOLI-XL',
        name: 'Çok Büyük Koli (XL)',
        innerLengthMm: 600,
        innerWidthMm: 450,
        innerHeightMm: 400,
        maxWeightGrams: 30000,
        tareWeightGrams: 850,
        active: true,
        priority: 50,
        createdAt: now,
        updatedAt: now,
      },
    ]

    for (const c of defaults) {
      inMemoryCartons.set(c.id, c)
    }
  }
}

ensureDefaultCartons()

export class CartonizationService {
  /**
   * Resets cartons to initial defaults (used for test isolation)
   */
  public static resetDefaults(): void {
    inMemoryCartons.clear()
    ensureDefaultCartons()
  }

  /**
   * Creates a new carton definition
   */
  public static async createCarton(input: CreateCartonInput, adminUserId = 'system'): Promise<WarehouseCartonRecord> {
    ensureDefaultCartons()

    if (!input.code || !input.name) {
      throw new WarehouseValidationError('Koli kodu ve adı zorunludur.')
    }
    if (input.innerLengthMm <= 0 || input.innerWidthMm <= 0 || input.innerHeightMm <= 0) {
      throw new WarehouseValidationError('Koli iç boyutları sıfırdan büyük olmalıdır.')
    }
    if (input.maxWeightGrams <= 0) {
      throw new WarehouseValidationError('Maksimum ağırlık sıfırdan büyük olmalıdır.')
    }

    const existingCode = Array.from(inMemoryCartons.values()).find(
      (c) => c.code.toUpperCase() === input.code.toUpperCase()
    )
    if (existingCode) {
      throw new WarehouseValidationError(`'${input.code}' kodlu koli tanımı zaten mevcut.`)
    }

    const now = new Date().toISOString()
    const id = `carton_${Date.now()}_${Math.floor(Math.random() * 1000)}`

    const record: WarehouseCartonRecord = {
      id,
      storeId: input.storeId || null,
      code: input.code.toUpperCase(),
      name: input.name,
      innerLengthMm: Math.round(input.innerLengthMm),
      innerWidthMm: Math.round(input.innerWidthMm),
      innerHeightMm: Math.round(input.innerHeightMm),
      maxWeightGrams: Math.round(input.maxWeightGrams),
      tareWeightGrams: Math.round(input.tareWeightGrams || 0),
      active: input.active !== undefined ? input.active : true,
      priority: input.priority !== undefined ? input.priority : 10,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryCartons.set(id, record)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseCarton as any).create({
          data: {
            id: record.id,
            storeId: record.storeId,
            code: record.code,
            name: record.name,
            innerLengthMm: record.innerLengthMm,
            innerWidthMm: record.innerWidthMm,
            innerHeightMm: record.innerHeightMm,
            maxWeightGrams: record.maxWeightGrams,
            tareWeightGrams: record.tareWeightGrams,
            active: record.active,
            priority: record.priority,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        })
      } catch (err) {
        console.warn('[CartonizationService] DB create failed:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.carton.created',
      entity: 'WarehouseCarton',
      entityId: id,
      userId: adminUserId,
      metadata: { code: record.code, name: record.name },
    })

    return record
  }

  /**
   * Updates an existing carton definition
   */
  public static async updateCarton(
    id: string,
    updates: Partial<CreateCartonInput>,
    adminUserId = 'system'
  ): Promise<WarehouseCartonRecord> {
    ensureDefaultCartons()
    const existing = inMemoryCartons.get(id)
    if (!existing) {
      throw new WarehouseNotFoundError(`Koli tanımı bulunamadı (ID: ${id}).`)
    }

    if (updates.innerLengthMm !== undefined && updates.innerLengthMm <= 0) {
      throw new WarehouseValidationError('Koli uzunluğu pozitif olmalıdır.')
    }
    if (updates.innerWidthMm !== undefined && updates.innerWidthMm <= 0) {
      throw new WarehouseValidationError('Koli genişliği pozitif olmalıdır.')
    }
    if (updates.innerHeightMm !== undefined && updates.innerHeightMm <= 0) {
      throw new WarehouseValidationError('Koli yüksekliği pozitif olmalıdır.')
    }
    if (updates.maxWeightGrams !== undefined && updates.maxWeightGrams <= 0) {
      throw new WarehouseValidationError('Koli taşıma kapasitesi pozitif olmalıdır.')
    }

    const now = new Date().toISOString()
    const updated: WarehouseCartonRecord = {
      ...existing,
      ...updates,
      code: updates.code ? updates.code.toUpperCase() : existing.code,
      updatedAt: now,
    }

    inMemoryCartons.set(id, updated)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseCarton as any).where({ id }).update({
          code: updated.code,
          name: updated.name,
          innerLengthMm: updated.innerLengthMm,
          innerWidthMm: updated.innerWidthMm,
          innerHeightMm: updated.innerHeightMm,
          maxWeightGrams: updated.maxWeightGrams,
          tareWeightGrams: updated.tareWeightGrams,
          active: updated.active,
          priority: updated.priority,
          updatedAt: new Date(now),
        })
      } catch (err) {
        console.warn('[CartonizationService] DB update failed:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.carton.updated',
      entity: 'WarehouseCarton',
      entityId: id,
      userId: adminUserId,
      metadata: { code: updated.code },
    })

    return updated
  }

  /**
   * Deletes a carton definition
   */
  public static async deleteCarton(id: string, adminUserId = 'system'): Promise<boolean> {
    ensureDefaultCartons()
    const existing = inMemoryCartons.get(id)
    if (!existing) {
      throw new WarehouseNotFoundError(`Koli tanımı bulunamadı (ID: ${id}).`)
    }

    inMemoryCartons.delete(id)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseCarton as any).where({ id }).delete()
      } catch (err) {
        console.warn('[CartonizationService] DB delete failed:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.carton.deleted',
      entity: 'WarehouseCarton',
      entityId: id,
      userId: adminUserId,
      metadata: { code: existing.code },
    })

    return true
  }

  /**
   * Lists available cartons with optional filtering
   */
  public static async listCartons(filters: {
    storeId?: string | null
    activeOnly?: boolean
  } = {}): Promise<WarehouseCartonRecord[]> {
    ensureDefaultCartons()
    let list = Array.from(inMemoryCartons.values())

    if (filters.activeOnly !== false) {
      list = list.filter((c) => c.active)
    }

    if (filters.storeId !== undefined) {
      list = list.filter((c) => c.storeId === null || c.storeId === filters.storeId)
    }

    return list.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
  }

  /**
   * Retrieves a single carton by ID
   */
  public static async getCarton(id: string): Promise<WarehouseCartonRecord | null> {
    ensureDefaultCartons()
    return inMemoryCartons.get(id) || null
  }

  /**
   * Core Deterministic 3D Cartonization Engine
   * Evaluates input items against available cartons.
   * Features:
   *  - Pure preview without side effects/mutations.
   *  - Dimension validations (rejects non-positive dimensions/weight).
   *  - Weight constraint (total product weight + tare <= maxWeight).
   *  - Volume constraint (total volume <= innerVolume).
   *  - 3D spatial layout evaluation with 6-direction orthogonal rotations.
   *  - Multi-product support.
   *  - Deterministic tie-breaking and smallest valid carton selection.
   *  - Structured diagnostics and error codes.
   */
  public static recommendCarton(
    items: CartonizationItemInput[],
    options: {
      storeId?: string | null
      customCartons?: WarehouseCartonRecord[]
      allowRotation?: boolean
    } = {}
  ): CartonizationResult {
    ensureDefaultCartons()

    // 1. Validate Input
    if (!items || items.length === 0) {
      return {
        success: false,
        recommendedCarton: null,
        estimatedUsedVolumeMm3: 0,
        cartonVolumeMm3: 0,
        volumeUtilizationPercent: 0,
        estimatedWeightGrams: 0,
        placements: [],
        errorCode: 'INVALID_INPUT',
        reason: 'Paketlenecek ürün listesi boş olamaz.',
      }
    }

    for (const it of items) {
      if (it.quantity <= 0) {
        return {
          success: false,
          recommendedCarton: null,
          estimatedUsedVolumeMm3: 0,
          cartonVolumeMm3: 0,
          volumeUtilizationPercent: 0,
          estimatedWeightGrams: 0,
          placements: [],
          errorCode: 'INVALID_INPUT',
          reason: `Ürün (${it.sku}) adedi sıfırdan büyük olmalıdır.`,
        }
      }
      if (
        !it.dimensions ||
        it.dimensions.lengthMm <= 0 ||
        it.dimensions.widthMm <= 0 ||
        it.dimensions.heightMm <= 0
      ) {
        return {
          success: false,
          recommendedCarton: null,
          estimatedUsedVolumeMm3: 0,
          cartonVolumeMm3: 0,
          volumeUtilizationPercent: 0,
          estimatedWeightGrams: 0,
          placements: [],
          errorCode: 'INVALID_INPUT',
          reason: `Ürün (${it.sku}) boyutları (uzunluk, genişlik, yükseklik) sıfırdan büyük olmalıdır.`,
        }
      }
      if (it.weightGrams <= 0) {
        return {
          success: false,
          recommendedCarton: null,
          estimatedUsedVolumeMm3: 0,
          cartonVolumeMm3: 0,
          volumeUtilizationPercent: 0,
          estimatedWeightGrams: 0,
          placements: [],
          errorCode: 'INVALID_INPUT',
          reason: `Ürün (${it.sku}) ağırlığı sıfırdan büyük olmalıdır.`,
        }
      }
    }

    // 2. Expand items into discrete units deterministically
    interface DiscreteUnit {
      unitIndex: number
      productId: string
      sku: string
      lengthMm: number
      widthMm: number
      heightMm: number
      weightGrams: number
      volumeMm3: number
      rotationAllowed: boolean
    }

    const units: DiscreteUnit[] = []
    let totalItemsWeightGrams = 0
    let totalItemsVolumeMm3 = 0
    let unitCounter = 0

    for (const it of items) {
      const vol = it.dimensions.lengthMm * it.dimensions.widthMm * it.dimensions.heightMm
      const allowRot =
        options.allowRotation !== undefined
          ? options.allowRotation
          : it.rotationAllowed !== undefined
          ? it.rotationAllowed
          : true

      for (let q = 0; q < it.quantity; q++) {
        units.push({
          unitIndex: unitCounter++,
          productId: it.productId,
          sku: it.sku,
          lengthMm: it.dimensions.lengthMm,
          widthMm: it.dimensions.widthMm,
          heightMm: it.dimensions.heightMm,
          weightGrams: it.weightGrams,
          volumeMm3: vol,
          rotationAllowed: allowRot,
        })
        totalItemsWeightGrams += it.weightGrams
        totalItemsVolumeMm3 += vol
      }
    }

    // Sort units deterministically: largest volume first, then longest dimension, then SKU
    units.sort((a, b) => {
      if (b.volumeMm3 !== a.volumeMm3) return b.volumeMm3 - a.volumeMm3
      const maxDimA = Math.max(a.lengthMm, a.widthMm, a.heightMm)
      const maxDimB = Math.max(b.lengthMm, b.widthMm, b.heightMm)
      if (maxDimB !== maxDimA) return maxDimB - maxDimA
      return a.sku.localeCompare(b.sku)
    })

    // 3. Collect active candidate cartons
    let candidateCartons: WarehouseCartonRecord[] = options.customCartons
      ? options.customCartons.filter((c) => c.active)
      : Array.from(inMemoryCartons.values()).filter((c) => c.active)

    if (options.storeId !== undefined) {
      candidateCartons = candidateCartons.filter(
        (c) => c.storeId === null || c.storeId === options.storeId
      )
    }

    if (candidateCartons.length === 0) {
      return {
        success: false,
        recommendedCarton: null,
        estimatedUsedVolumeMm3: totalItemsVolumeMm3,
        cartonVolumeMm3: 0,
        volumeUtilizationPercent: 0,
        estimatedWeightGrams: totalItemsWeightGrams,
        placements: [],
        errorCode: 'NO_FITTING_CARTON',
        reason: 'Sistemde aktif koli tanımı bulunamadı.',
      }
    }

    // Sort candidate cartons deterministically:
    // 1. Inner volume ascending (smallest first)
    // 2. Priority ascending
    // 3. Stable carton ID
    candidateCartons.sort((a, b) => {
      const volA = a.innerLengthMm * a.innerWidthMm * a.innerHeightMm
      const volB = b.innerLengthMm * b.innerWidthMm * b.innerHeightMm
      if (volA !== volB) return volA - volB
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.id.localeCompare(b.id)
    })

    // 4. Try candidate cartons in order
    let weightExceededCount = 0
    let dimensionExceededCount = 0

    for (const carton of candidateCartons) {
      const cartonVolumeMm3 =
        carton.innerLengthMm * carton.innerWidthMm * carton.innerHeightMm
      const totalEstimatedWeight = totalItemsWeightGrams + carton.tareWeightGrams

      // Check A: Weight capacity
      if (totalEstimatedWeight > carton.maxWeightGrams) {
        weightExceededCount++
        continue
      }

      // Check B: Total volume capacity
      if (totalItemsVolumeMm3 > cartonVolumeMm3) {
        dimensionExceededCount++
        continue
      }

      // Check C: Individual item boundary checks
      let canAnyItemFit = true
      for (const u of units) {
        const sortedItemDims = [u.lengthMm, u.widthMm, u.heightMm].sort((a, b) => a - b)
        const sortedCartonDims = [
          carton.innerLengthMm,
          carton.innerWidthMm,
          carton.innerHeightMm,
        ].sort((a, b) => a - b)

        if (
          sortedItemDims[0] > sortedCartonDims[0] ||
          sortedItemDims[1] > sortedCartonDims[1] ||
          sortedItemDims[2] > sortedCartonDims[2]
        ) {
          canAnyItemFit = false
          break
        }
      }
      if (!canAnyItemFit) {
        dimensionExceededCount++
        continue
      }

      // Check D: 3D Bin Packing Placement Simulation (Deterministic Guillotine / Shelf layer packing)
      const placementResult = CartonizationService.simulate3DPlacement(units, carton)

      if (placementResult.fits) {
        const utilPercent =
          cartonVolumeMm3 > 0
            ? Math.round((totalItemsVolumeMm3 / cartonVolumeMm3) * 10000) / 100
            : 0

        return {
          success: true,
          recommendedCarton: carton,
          estimatedUsedVolumeMm3: totalItemsVolumeMm3,
          cartonVolumeMm3,
          volumeUtilizationPercent: Math.min(100, utilPercent),
          estimatedWeightGrams: totalEstimatedWeight,
          placements: placementResult.placements,
          reason: `Önerilen koli: ${carton.name} (${carton.code}) - Doluluk: %${utilPercent.toFixed(1)}`,
        }
      }
    }

    // If reached here, no carton could accommodate the items
    let reason = 'Ürünler mevcut koli boyutlarına veya ağırlık sınırlarına sığmıyor.'
    let errorCode: CartonizationResult['errorCode'] = 'NO_FITTING_CARTON'

    if (weightExceededCount === candidateCartons.length) {
      reason = `Toplam ağırlık (${totalItemsWeightGrams}g) mevcut kolilerin taşıma kapasitesini aşıyor.`
      errorCode = 'EXCEEDS_MAX_WEIGHT'
    } else if (dimensionExceededCount === candidateCartons.length) {
      reason = 'Ürünlerin boyutları veya toplam hacmi mevcut kolilerin kapasitesini aşıyor.'
      errorCode = 'EXCEEDS_DIMENSIONS'
    }

    return {
      success: false,
      recommendedCarton: null,
      estimatedUsedVolumeMm3: totalItemsVolumeMm3,
      cartonVolumeMm3: 0,
      volumeUtilizationPercent: 0,
      estimatedWeightGrams: totalItemsWeightGrams,
      placements: [],
      errorCode,
      reason,
      diagnostics: `Aday koli sayısı: ${candidateCartons.length}, Ağırlık aşımı: ${weightExceededCount}, Boyut aşımı: ${dimensionExceededCount}`,
    }
  }

  /**
   * Deterministic 3D Placement Simulator
   * Packs discrete items into a cuboid carton using shelf layer bounding box allocation.
   */
  private static simulate3DPlacement(
    units: Array<{
      unitIndex: number
      productId: string
      sku: string
      lengthMm: number
      widthMm: number
      heightMm: number
      rotationAllowed: boolean
    }>,
    carton: WarehouseCartonRecord
  ): { fits: boolean; placements: CartonPlacement[] } {
    const cL = carton.innerLengthMm
    const cW = carton.innerWidthMm
    const cH = carton.innerHeightMm

    const placements: CartonPlacement[] = []

    // Shelf/layer tracking
    let currentX = 0
    let currentY = 0
    let currentZ = 0
    let currentLayerHeight = 0
    let currentShelfWidth = 0

    for (const u of units) {
      // Generate deterministic candidate orientations
      const candidateOrientations = CartonizationService.getPermittedOrientations(
        u.lengthMm,
        u.widthMm,
        u.heightMm,
        u.rotationAllowed
      )

      let placed = false

      // Try placing in current shelf position
      for (const orient of candidateOrientations) {
        const { l, w, h, label } = orient

        // Check if fits in current shelf line along X
        if (
          currentX + l <= cL &&
          currentY + w <= cW &&
          currentZ + h <= cH
        ) {
          placements.push({
            productId: u.productId,
            sku: u.sku,
            position: { x: currentX, y: currentY, z: currentZ },
            dimensions: { lengthMm: l, widthMm: w, heightMm: h },
            rotation: label,
          })

          currentX += l
          if (w > currentShelfWidth) currentShelfWidth = w
          if (h > currentLayerHeight) currentLayerHeight = h
          placed = true
          break
        }

        // Try next row in Y within current layer
        const nextY = currentY + currentShelfWidth
        if (
          l <= cL &&
          nextY + w <= cW &&
          currentZ + h <= cH
        ) {
          currentX = 0
          currentY = nextY
          currentShelfWidth = w

          placements.push({
            productId: u.productId,
            sku: u.sku,
            position: { x: currentX, y: currentY, z: currentZ },
            dimensions: { lengthMm: l, widthMm: w, heightMm: h },
            rotation: label,
          })

          currentX = l
          if (h > currentLayerHeight) currentLayerHeight = h
          placed = true
          break
        }

        // Try next layer in Z
        const nextZ = currentZ + currentLayerHeight
        if (
          l <= cL &&
          w <= cW &&
          nextZ + h <= cH
        ) {
          currentX = 0
          currentY = 0
          currentZ = nextZ
          currentLayerHeight = h
          currentShelfWidth = w

          placements.push({
            productId: u.productId,
            sku: u.sku,
            position: { x: currentX, y: currentY, z: currentZ },
            dimensions: { lengthMm: l, widthMm: w, heightMm: h },
            rotation: label,
          })

          currentX = l
          placed = true
          break
        }
      }

      if (!placed) {
        return { fits: false, placements: [] }
      }
    }

    return { fits: true, placements }
  }

  /**
   * Returns deterministic list of candidate 3D orthogonal orientations
   */
  private static getPermittedOrientations(
    l: number,
    w: number,
    h: number,
    allowRotation: boolean
  ): Array<{ l: number; w: number; h: number; label: string }> {
    if (!allowRotation) {
      // Rotation forbidden: height must remain in Z axis, can only swap L and W
      return [
        { l, w, h, label: 'DEG_0_LWH' },
        { l: w, w: l, h, label: 'DEG_90_WLH' },
      ]
    }

    // Full 6 orthogonal orientations sorted deterministically
    const perms = [
      { l, w, h, label: 'LWH' },
      { l, w: h, h: w, label: 'LHW' },
      { l: w, w: l, h, label: 'WLH' },
      { l: w, w: h, h: l, label: 'WHL' },
      { l: h, w: l, h: w, label: 'HLW' },
      { l: h, w, h: l, label: 'HWL' },
    ]

    // Deduplicate identical orientation geometries
    const seen = new Set<string>()
    const unique: Array<{ l: number; w: number; h: number; label: string }> = []

    for (const p of perms) {
      const key = `${p.l}x${p.w}x${p.h}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(p)
      }
    }

    return unique
  }
}
