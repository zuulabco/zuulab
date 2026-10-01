import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import { getMaterials, getMaterialByName, getProductCostProfile } from './product-economics.service'
import { DailyOperationsService, type ProductionRecommendationItem } from './daily-operations.service'
import { getProductionOrders } from './production.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import type { AuthUser } from './auth.service'

// ─────────────────────────────────────────────────────────────
// TYPES & ENUMS
// ─────────────────────────────────────────────────────────────

export type MaterialMovementType =
  | 'PURCHASE'
  | 'MANUAL_ADJUSTMENT'
  | 'PRODUCTION_CONSUMPTION'
  | 'WASTE'
  | 'RETURN'

export type MaterialReadinessStatus = 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'

export interface MaterialStockItem {
  id: string
  storeId?: string | null
  materialProfileId?: string | null
  materialName: string
  color: string | null
  quantityGrams: number
  minimumQuantityGrams: number
  location?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Operational Economics
  pricePerKgTl?: number | null
  totalValueTl?: number | null
}

export interface MaterialStockMovementItem {
  id: string
  materialStockId: string
  type: MaterialMovementType
  quantityGrams: number
  previousQuantityGrams: number
  newQuantityGrams: number
  reason: string
  reference?: string | null
  idempotencyKey?: string | null
  createdBy: string
  createdAt: string
}

export interface MaterialReadinessItem {
  materialName: string
  color: string | null
  availableGrams: number
  requiredGrams: number
  minimumGrams: number
  remainingGrams: number
  missingGrams: number
  status: MaterialReadinessStatus
  stockId?: string | null
  pricePerKgTl?: number | null
  estimatedRequiredCostTl?: number | null
  affectedProductsCount: number
  isBlocked: boolean
}

export interface MaterialProductionBlocker {
  productId: string
  productName: string
  sku: string
  productionQuantity: number
  materialName: string
  color: string | null
  requiredGrams: number
  availableGrams: number
  missingGrams: number
  status: MaterialReadinessStatus
  actionUrl: string
}

export interface MaterialReadinessSummary {
  totalMaterialGrams: number
  totalMaterialValueTl: number
  criticalMaterialCount: number
  blockingMaterialCount: number
  todayRequiredGrams: number
  productionDemandCount: number
  producibleCount: number
  blockedCount: number
  materials: MaterialReadinessItem[]
  blockers: MaterialProductionBlocker[]
}

export interface CreateMaterialStockInput {
  materialName: string
  color?: string | null
  quantityGrams?: number
  minimumQuantityGrams?: number
  location?: string | null
  materialProfileId?: string | null
  reason?: string
  idempotencyKey?: string
}

export interface UpdateMaterialStockInput {
  color?: string | null
  minimumQuantityGrams?: number
  location?: string | null
  isActive?: boolean
}

export interface AdjustMaterialStockInput {
  deltaGrams: number
  type?: MaterialMovementType
  reason: string
  reference?: string | null
  idempotencyKey?: string
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STORAGE (Neutral Test & Dev Fallback)
// ─────────────────────────────────────────────────────────────

const inMemoryStocks: Map<string, MaterialStockItem> = new Map()
const inMemoryMovements: Map<string, MaterialStockMovementItem[]> = new Map()
const seenAdjustmentIdempotencyKeys: Set<string> = new Set()

// Seed default initial stocks for Zuulab workshop
const DEFAULT_INITIAL_STOCKS: Array<Omit<MaterialStockItem, 'pricePerKgTl' | 'totalValueTl'>> = [
  {
    id: 'mat-stock-pla-black',
    storeId: null,
    materialProfileId: 'mat-pla',
    materialName: 'PLA',
    color: 'Black',
    quantityGrams: 2500,
    minimumQuantityGrams: 1500,
    location: 'Raf A-1',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-stock-pla-white',
    storeId: null,
    materialProfileId: 'mat-pla',
    materialName: 'PLA',
    color: 'White',
    quantityGrams: 2000,
    minimumQuantityGrams: 1500,
    location: 'Raf A-2',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-stock-petg-black',
    storeId: null,
    materialProfileId: 'mat-petg',
    materialName: 'PETG',
    color: 'Black',
    quantityGrams: 1200,
    minimumQuantityGrams: 1500,
    location: 'Raf B-1',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-stock-tpu-clear',
    storeId: null,
    materialProfileId: 'mat-tpu',
    materialName: 'TPU',
    color: null,
    quantityGrams: 650,
    minimumQuantityGrams: 500,
    location: 'Raf C-1',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-stock-abs-black',
    storeId: null,
    materialProfileId: 'mat-abs',
    materialName: 'ABS',
    color: 'Black',
    quantityGrams: 0,
    minimumQuantityGrams: 1000,
    location: 'Raf B-2',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
]

for (const s of DEFAULT_INITIAL_STOCKS) {
  inMemoryStocks.set(s.id, { ...s })
  inMemoryMovements.set(s.id, [
    {
      id: `mov-init-${s.id}`,
      materialStockId: s.id,
      type: 'PURCHASE',
      quantityGrams: s.quantityGrams,
      previousQuantityGrams: 0,
      newQuantityGrams: s.quantityGrams,
      reason: 'Açılış stok kaydı',
      reference: 'INIT-2026',
      createdBy: 'system@zuulab.com',
      createdAt: s.createdAt,
    },
  ])
}

// ─────────────────────────────────────────────────────────────
// MATERIAL SERVICE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

export class MaterialService {
  /**
   * Normalizes color string for exact comparison (case-insensitive trim)
   */
  public static normalizeColor(color?: string | null): string | null {
    if (!color) return null
    const trimmed = color.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  /**
   * Retrieves all material stocks respecting strict server-side store isolation
   */
  public static async getMaterialStocks(storeId?: string | null): Promise<MaterialStockItem[]> {
    const effectiveStoreId = storeId || null
    let stocks: MaterialStockItem[] = []

    if (isDatabaseConfigured) {
      try {
        const records = await (db.orm.public as any).MaterialStock.where({
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
          isActive: true,
        }).findMany()

        if (records && records.length > 0) {
          stocks = records.map((r: any) => ({
            id: r.id,
            storeId: r.storeId || null,
            materialProfileId: r.materialProfileId || null,
            materialName: r.materialName,
            color: r.color || null,
            quantityGrams: Number(r.quantityGrams),
            minimumQuantityGrams: Number(r.minimumQuantityGrams),
            location: r.location || null,
            isActive: Boolean(r.isActive),
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        }
      } catch {
        // fallback to in-memory
      }
    }

    if (stocks.length === 0) {
      stocks = Array.from(inMemoryStocks.values()).filter((s) => {
        if (!s.isActive) return false
        if (effectiveStoreId) {
          return s.storeId === effectiveStoreId
        }
        return s.storeId === null || s.storeId === undefined
      })
    }

    // Attach operational pricing from Phase 24 MaterialProfile
    const enriched: MaterialStockItem[] = []
    for (const stock of stocks) {
      const matProfile = await getMaterialByName(stock.materialName, effectiveStoreId)
      const pricePerKgTl = matProfile ? matProfile.pricePerKgTl : null
      const totalValueTl =
        pricePerKgTl !== null
          ? Math.round(((stock.quantityGrams / 1000) * pricePerKgTl) * 100) / 100
          : null

      enriched.push({
        ...stock,
        pricePerKgTl,
        totalValueTl,
      })
    }

    // Sort by materialName ASC, color ASC
    return enriched.sort((a, b) => {
      const cmp = a.materialName.localeCompare(b.materialName)
      if (cmp !== 0) return cmp
      return (a.color || '').localeCompare(b.color || '')
    })
  }

  /**
   * Retrieves single material stock by ID with store isolation guard
   */
  public static async getMaterialStockById(
    id: string,
    storeId?: string | null
  ): Promise<MaterialStockItem | null> {
    const effectiveStoreId = storeId || null
    let stock: MaterialStockItem | null = null

    if (isDatabaseConfigured) {
      try {
        const record = await (db.orm.public as any).MaterialStock.where({ id }).first()
        if (record) {
          stock = {
            id: record.id,
            storeId: record.storeId || null,
            materialProfileId: record.materialProfileId || null,
            materialName: record.materialName,
            color: record.color || null,
            quantityGrams: Number(record.quantityGrams),
            minimumQuantityGrams: Number(record.minimumQuantityGrams),
            location: record.location || null,
            isActive: Boolean(record.isActive),
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
          }
        }
      } catch {
        // fallback
      }
    }

    if (!stock) {
      stock = inMemoryStocks.get(id) || null
    }

    if (!stock) return null

    // Store isolation boundary
    if (effectiveStoreId && stock.storeId && stock.storeId !== effectiveStoreId) {
      return null
    }

    // Attach economics
    const matProfile = await getMaterialByName(stock.materialName, effectiveStoreId)
    const pricePerKgTl = matProfile ? matProfile.pricePerKgTl : null
    const totalValueTl =
      pricePerKgTl !== null
        ? Math.round(((stock.quantityGrams / 1000) * pricePerKgTl) * 100) / 100
        : null

    return {
      ...stock,
      pricePerKgTl,
      totalValueTl,
    }
  }

  /**
   * Creates a new material stock item with store context and initial movement
   */
  public static async createMaterialStock(
    input: CreateMaterialStockInput,
    user: AuthUser
  ): Promise<{ success: boolean; stock?: MaterialStockItem; error?: string }> {
    if (!input.materialName || input.materialName.trim() === '') {
      return { success: false, error: 'Malzeme adı zorunludur.' }
    }

    const quantityGrams = Number(input.quantityGrams || 0)
    if (quantityGrams < 0) {
      return { success: false, error: 'Malzeme miktarı negatif olamaz.' }
    }

    const minimumQuantityGrams = Number(input.minimumQuantityGrams ?? 1000)
    if (minimumQuantityGrams < 0) {
      return { success: false, error: 'Minimum miktar negatif olamaz.' }
    }

    // Strict store isolation from server auth context
    const storeId = user.storeId || null
    const normalizedColor = this.normalizeColor(input.color)

    // Check duplicate
    const existing = Array.from(inMemoryStocks.values()).find(
      (s) =>
        s.storeId === storeId &&
        s.materialName.toLowerCase() === input.materialName.toLowerCase() &&
        (s.color || '').toLowerCase() === (normalizedColor || '').toLowerCase()
    )

    if (existing) {
      return {
        success: false,
        error: `Bu mağazada '${input.materialName}' ${normalizedColor ? `(${normalizedColor})` : ''} stoğu zaten tanımlı. Lütfen miktar güncellemesi yapın.`,
      }
    }

    const now = new Date().toISOString()
    const id = `mat-stock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

    // Resolve materialProfileId if not provided
    let materialProfileId = input.materialProfileId || null
    if (!materialProfileId) {
      const prof = await getMaterialByName(input.materialName, storeId)
      if (prof) materialProfileId = prof.id
    }

    const newStock: MaterialStockItem = {
      id,
      storeId,
      materialProfileId,
      materialName: input.materialName.trim(),
      color: normalizedColor,
      quantityGrams,
      minimumQuantityGrams,
      location: input.location ? input.location.trim() : null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryStocks.set(id, newStock)

    // Create initial movement if quantity > 0
    if (quantityGrams > 0) {
      const movement: MaterialStockMovementItem = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        materialStockId: id,
        type: 'PURCHASE',
        quantityGrams,
        previousQuantityGrams: 0,
        newQuantityGrams: quantityGrams,
        reason: input.reason || 'İlk stok girişi',
        reference: input.idempotencyKey || null,
        idempotencyKey: input.idempotencyKey || null,
        createdBy: user.email || user.id,
        createdAt: now,
      }
      inMemoryMovements.set(id, [movement])
    } else {
      inMemoryMovements.set(id, [])
    }

    // Audit log
    await logAuditEvent({
      action: 'MATERIAL_STOCK_CREATED',
      entity: 'MaterialStock',
      entityId: id,
      userId: user.id || user.email,
      metadata: {
        storeId,
        materialName: newStock.materialName,
        color: newStock.color,
        quantityGrams: newStock.quantityGrams,
        minimumQuantityGrams: newStock.minimumQuantityGrams,
      },
    })

    return { success: true, stock: newStock }
  }

  /**
   * Updates non-quantity metadata of a material stock item
   */
  public static async updateMaterialStock(
    id: string,
    input: UpdateMaterialStockInput,
    user: AuthUser
  ): Promise<{ success: boolean; stock?: MaterialStockItem; error?: string }> {
    const stock = await this.getMaterialStockById(id, user.storeId)
    if (!stock) {
      return { success: false, error: 'Malzeme stoğu bulunamadı veya erişim yetkiniz yok.' }
    }

    if (input.minimumQuantityGrams !== undefined && input.minimumQuantityGrams < 0) {
      return { success: false, error: 'Minimum miktar negatif olamaz.' }
    }

    const updated: MaterialStockItem = {
      ...stock,
      color: input.color !== undefined ? this.normalizeColor(input.color) : stock.color,
      minimumQuantityGrams:
        input.minimumQuantityGrams !== undefined
          ? input.minimumQuantityGrams
          : stock.minimumQuantityGrams,
      location: input.location !== undefined ? (input.location?.trim() || null) : stock.location,
      isActive: input.isActive !== undefined ? input.isActive : stock.isActive,
      updatedAt: new Date().toISOString(),
    }

    inMemoryStocks.set(id, updated)

    await logAuditEvent({
      action: 'MATERIAL_STOCK_UPDATED',
      entity: 'MaterialStock',
      entityId: id,
      userId: user.id || user.email,
      metadata: {
        storeId: user.storeId || null,
        ...(input as any),
      },
    })

    return { success: true, stock: updated }
  }

  /**
   * Adjusts material stock quantity idempotently, enforcing non-negative invariant and movement log
   */
  public static async adjustMaterialStock(
    id: string,
    input: AdjustMaterialStockInput,
    user: AuthUser
  ): Promise<{
    success: boolean
    stock?: MaterialStockItem
    movement?: MaterialStockMovementItem
    isIdempotentRepeat?: boolean
    error?: string
  }> {
    const stock = await this.getMaterialStockById(id, user.storeId)
    if (!stock) {
      return { success: false, error: 'Malzeme stoğu bulunamadı veya erişim yetkiniz yok.' }
    }

    if (!input.reason || input.reason.trim() === '') {
      return { success: false, error: 'Düzeltme gerekçesi belirtilmelidir.' }
    }

    const delta = Number(input.deltaGrams || 0)
    if (delta === 0) {
      return { success: false, error: 'Düzeltme miktarı sıfır olamaz.' }
    }

    // ── IDEMPOTENCY CHECK ──────────────────────────────────────────
    if (input.idempotencyKey && input.idempotencyKey.trim() !== '') {
      const key = input.idempotencyKey.trim()
      const existingMovements = inMemoryMovements.get(id) || []
      const found = existingMovements.find((m) => m.idempotencyKey === key)
      if (found || seenAdjustmentIdempotencyKeys.has(key)) {
        return {
          success: true,
          stock,
          movement: found,
          isIdempotentRepeat: true,
        }
      }
      seenAdjustmentIdempotencyKeys.add(key)
    }

    // ── NON-NEGATIVE INVARIANT CHECK ───────────────────────────────
    const previousQuantity = stock.quantityGrams
    const newQuantity = previousQuantity + delta

    if (newQuantity < 0) {
      return {
        success: false,
        error: `İşlem reddedildi: Malzeme miktarı negatif olamaz. (Mevcut: ${previousQuantity}g, Talep edilen değişim: ${delta}g)`,
      }
    }

    const now = new Date().toISOString()
    const movementType: MaterialMovementType =
      input.type || (delta > 0 ? 'PURCHASE' : 'MANUAL_ADJUSTMENT')

    const movement: MaterialStockMovementItem = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      materialStockId: id,
      type: movementType,
      quantityGrams: Math.abs(delta),
      previousQuantityGrams: previousQuantity,
      newQuantityGrams: newQuantity,
      reason: input.reason.trim(),
      reference: input.reference ? input.reference.trim() : null,
      idempotencyKey: input.idempotencyKey ? input.idempotencyKey.trim() : null,
      createdBy: user.email || user.id,
      createdAt: now,
    }

    // Update stock in memory
    const updatedStock: MaterialStockItem = {
      ...stock,
      quantityGrams: newQuantity,
      updatedAt: now,
    }
    inMemoryStocks.set(id, updatedStock)

    // Append movement
    const currentMovs = inMemoryMovements.get(id) || []
    currentMovs.push(movement)
    inMemoryMovements.set(id, currentMovs)

    // Audit log
    await logAuditEvent({
      action: 'MATERIAL_STOCK_ADJUSTED',
      entity: 'MaterialStock',
      entityId: id,
      userId: user.id || user.email,
      metadata: {
        storeId: user.storeId || null,
        deltaGrams: delta,
        previousQuantityGrams: previousQuantity,
        newQuantityGrams: newQuantity,
        type: movementType,
        reason: movement.reason,
        idempotencyKey: movement.idempotencyKey,
      },
    })

    return {
      success: true,
      stock: updatedStock,
      movement,
      isIdempotentRepeat: false,
    }
  }

  /**
   * Retrieves movement history for a material stock item
   */
  public static async getMaterialMovements(
    stockId: string,
    storeId?: string | null
  ): Promise<MaterialStockMovementItem[]> {
    const stock = await this.getMaterialStockById(stockId, storeId)
    if (!stock) return []

    const movements = inMemoryMovements.get(stockId) || []
    // Deterministic Sort: createdAt DESC
    return [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Parses product material & color specifications with zero fuzzy guesses
   */
  public static parseProductMaterial(product: {
    material?: string | null
    name?: string | null
    weight?: number | null
    estimatedMaterialWeightGrams?: number | null
  }): { materialName: string | null; color: string | null; weightGrams: number | null } {
    let weightGrams =
      product.estimatedMaterialWeightGrams !== undefined && product.estimatedMaterialWeightGrams !== null
        ? Number(product.estimatedMaterialWeightGrams)
        : product.weight !== undefined && product.weight !== null
        ? Number(product.weight)
        : null

    if (weightGrams !== null && isNaN(weightGrams)) {
      weightGrams = null
    }

    const rawMat = (product.material || '').trim()
    if (!rawMat) {
      return { materialName: null, color: null, weightGrams }
    }

    // Supported base materials
    const KNOWN_MATERIALS = ['PLA', 'PETG', 'TPU', 'ABS', 'Standart Reçine', 'Reçine']
    let matchedBase: string | null = null

    for (const base of KNOWN_MATERIALS) {
      if (rawMat.toUpperCase().includes(base.toUpperCase())) {
        matchedBase = base === 'Reçine' ? 'Standart Reçine' : base
        break
      }
    }

    if (!matchedBase) {
      matchedBase = rawMat.split(' ')[0]
    }

    // Check color clues from rawMat or product name
    const KNOWN_COLORS = [
      'Black',
      'White',
      'Red',
      'Blue',
      'Green',
      'Yellow',
      'Grey',
      'Gray',
      'Orange',
      'Purple',
      'Siyah',
      'Beyaz',
      'Kırmızı',
      'Mavi',
      'Yeşil',
      'Sarı',
      'Gri',
      'Turuncu',
      'Mor',
      'Doğal',
      'Krem',
    ]

    let matchedColor: string | null = null
    const textToScan = `${rawMat} ${product.name || ''}`

    for (const c of KNOWN_COLORS) {
      const reg = new RegExp(`\\b${c}\\b`, 'i')
      if (reg.test(textToScan)) {
        // Standardize common Turkish/English color names
        if (['Siyah', 'Black'].includes(c)) matchedColor = 'Black'
        else if (['Beyaz', 'White'].includes(c)) matchedColor = 'White'
        else if (['Kırmızı', 'Red'].includes(c)) matchedColor = 'Red'
        else if (['Mavi', 'Blue'].includes(c)) matchedColor = 'Blue'
        else if (['Yeşil', 'Green'].includes(c)) matchedColor = 'Green'
        else if (['Sarı', 'Yellow'].includes(c)) matchedColor = 'Yellow'
        else if (['Gri', 'Grey', 'Gray'].includes(c)) matchedColor = 'Grey'
        else matchedColor = c
        break
      }
    }

    return {
      materialName: matchedBase,
      color: matchedColor,
      weightGrams,
    }
  }

  /**
   * Computes comprehensive material readiness & production blockers
   * Pure deterministic read model — zero mutations.
   */
  public static async getMaterialReadiness(
    storeId?: string | null
  ): Promise<MaterialReadinessSummary> {
    const effectiveStoreId = storeId || null

    // 1. Fetch current available material stocks
    const currentStocks = await this.getMaterialStocks(effectiveStoreId)

    // 2. Fetch order-driven production recommendations from Phase 28 authority
    const recommendations = await DailyOperationsService.getProductionRecommendations(effectiveStoreId)

    // 3. Aggregate requirements by materialName + color
    // Key: `${materialName}::${color || ''}`
    interface RequirementBucket {
      materialName: string
      color: string | null
      requiredGrams: number
      affectedProductIds: Set<string>
      isUnknown: boolean
      unknownReason?: string
    }

    const requirementBuckets = new Map<string, RequirementBucket>()

    // Tracking items that need production
    let productionDemandCount = 0
    const blockedProductIds = new Set<string>()
    const blockers: MaterialProductionBlocker[] = []

    for (const rec of recommendations) {
      if (rec.requiredProduction <= 0) continue
      productionDemandCount++

      // Look up product specification & economics
      const prod = MOCK_PRODUCTS.find((p) => p.id === rec.productId || p.sku === rec.sku)
      const costProfile = await getProductCostProfile(rec.productId, effectiveStoreId)

      let materialName: string | null = null
      let color: string | null = null
      let weightGrams: number | null = null

      if (costProfile && costProfile.materialName) {
        materialName = costProfile.materialName
        weightGrams = costProfile.estimatedMaterialWeightGrams
        // Parse color if present
        const parsed = this.parseProductMaterial({
          material: costProfile.materialName,
          name: costProfile.productName,
          weight: costProfile.estimatedMaterialWeightGrams,
        })
        color = parsed.color
      } else if (prod) {
        const parsed = this.parseProductMaterial(prod)
        materialName = parsed.materialName
        color = parsed.color
        weightGrams = parsed.weightGrams
      }

      // Check if material requirement data is complete or UNKNOWN
      // (Section 12: "Material requirement veya stock bilgisi güvenilir değilse: UNKNOWN göster. Unknown değerleri 0 olarak kabul etme.")
      if (!materialName || weightGrams === null || weightGrams <= 0) {
        const bucketKey = `UNKNOWN::${rec.productId}`
        requirementBuckets.set(bucketKey, {
          materialName: materialName || 'Bilinmeyen Malzeme',
          color: color || null,
          requiredGrams: 0,
          affectedProductIds: new Set([rec.productId]),
          isUnknown: true,
          unknownReason: !materialName ? 'Malzeme türü eksik' : 'Gramaj bilgisi eksik',
        })
        continue
      }

      // Deterministic requirement formula (Section 10):
      // requiredMaterialGrams = productionQuantity × productMaterialGrams
      const requiredGrams = rec.requiredProduction * weightGrams

      const bucketKey = `${materialName.toUpperCase()}::${(color || '').toUpperCase()}`
      const cur = requirementBuckets.get(bucketKey) || {
        materialName,
        color,
        requiredGrams: 0,
        affectedProductIds: new Set(),
        isUnknown: false,
      }
      cur.requiredGrams += requiredGrams
      cur.affectedProductIds.add(rec.productId)
      requirementBuckets.set(bucketKey, cur)
    }

    // 4. Map requirements against available stocks
    const readinessList: MaterialReadinessItem[] = []
    let totalMaterialGrams = 0
    let totalMaterialValueTl = 0
    let criticalMaterialCount = 0
    let blockingMaterialCount = 0
    let todayRequiredGrams = 0

    // Keep track of which stocks have been mapped
    const processedStockIds = new Set<string>()

    // First process requirement buckets
    for (const [bucketKey, bucket] of requirementBuckets.entries()) {
      if (bucket.isUnknown) {
        readinessList.push({
          materialName: bucket.materialName,
          color: bucket.color,
          availableGrams: 0,
          requiredGrams: 0,
          minimumGrams: 0,
          remainingGrams: 0,
          missingGrams: 0,
          status: 'UNKNOWN',
          stockId: null,
          pricePerKgTl: null,
          estimatedRequiredCostTl: null,
          affectedProductsCount: bucket.affectedProductIds.size,
          isBlocked: false,
        })
        continue
      }

      todayRequiredGrams += bucket.requiredGrams

      // Exact material & color matching (Section 16)
      // If bucket has color: match ONLY stock with exact same color
      // If bucket has NO color: match stock with color === null OR first matching stock
      const matchingStock = currentStocks.find((s) => {
        if (s.materialName.toUpperCase() !== bucket.materialName.toUpperCase()) return false
        if (bucket.color) {
          return (s.color || '').toUpperCase() === bucket.color.toUpperCase()
        }
        return s.color === null || s.color === undefined
      })

      const availableGrams = matchingStock ? matchingStock.quantityGrams : 0
      const minimumGrams = matchingStock ? matchingStock.minimumQuantityGrams : 1000
      const pricePerKgTl = matchingStock ? (matchingStock.pricePerKgTl || 700) : 700

      if (matchingStock) {
        processedStockIds.add(matchingStock.id)
      }

      // Readiness classification (Section 12)
      let status: MaterialReadinessStatus = 'READY'
      let missingGrams = 0
      let remainingGrams = 0
      let isBlocked = false

      if (availableGrams < bucket.requiredGrams) {
        status = 'BLOCKED'
        missingGrams = bucket.requiredGrams - availableGrams
        remainingGrams = 0
        isBlocked = true
        blockingMaterialCount++
      } else {
        missingGrams = 0
        remainingGrams = availableGrams - bucket.requiredGrams
        if (remainingGrams < minimumGrams || availableGrams < minimumGrams) {
          status = 'LOW'
          criticalMaterialCount++
        } else {
          status = 'READY'
        }
      }

      const estimatedRequiredCostTl = Math.round(((bucket.requiredGrams / 1000) * pricePerKgTl) * 100) / 100

      readinessList.push({
        materialName: bucket.materialName,
        color: bucket.color,
        availableGrams,
        requiredGrams: bucket.requiredGrams,
        minimumGrams,
        remainingGrams,
        missingGrams,
        status,
        stockId: matchingStock ? matchingStock.id : null,
        pricePerKgTl,
        estimatedRequiredCostTl,
        affectedProductsCount: bucket.affectedProductIds.size,
        isBlocked,
      })

      // If blocked, record production blocker items for each affected product
      if (isBlocked) {
        for (const prodId of bucket.affectedProductIds) {
          blockedProductIds.add(prodId)
          const rec = recommendations.find((r) => r.productId === prodId)
          if (rec) {
            blockers.push({
              productId: rec.productId,
              productName: rec.productName,
              sku: rec.sku,
              productionQuantity: rec.requiredProduction,
              materialName: bucket.materialName,
              color: bucket.color,
              requiredGrams: bucket.requiredGrams,
              availableGrams,
              missingGrams,
              status: 'BLOCKED',
              actionUrl: matchingStock ? `/admin/materials/${matchingStock.id}` : '/admin/materials',
            })
          }
        }
      }
    }

    // Now include all remaining available stocks that had 0 demand today
    for (const stock of currentStocks) {
      totalMaterialGrams += stock.quantityGrams
      totalMaterialValueTl += stock.totalValueTl || 0

      if (processedStockIds.has(stock.id)) continue

      const status: MaterialReadinessStatus =
        stock.quantityGrams < stock.minimumQuantityGrams ? 'LOW' : 'READY'

      if (status === 'LOW') {
        criticalMaterialCount++
      }

      readinessList.push({
        materialName: stock.materialName,
        color: stock.color,
        availableGrams: stock.quantityGrams,
        requiredGrams: 0,
        minimumGrams: stock.minimumQuantityGrams,
        remainingGrams: stock.quantityGrams,
        missingGrams: 0,
        status,
        stockId: stock.id,
        pricePerKgTl: stock.pricePerKgTl || null,
        estimatedRequiredCostTl: 0,
        affectedProductsCount: 0,
        isBlocked: false,
      })
    }

    const blockedCount = blockedProductIds.size
    const producibleCount = Math.max(0, productionDemandCount - blockedCount)

    return {
      totalMaterialGrams,
      totalMaterialValueTl: Math.round(totalMaterialValueTl * 100) / 100,
      criticalMaterialCount,
      blockingMaterialCount,
      todayRequiredGrams,
      productionDemandCount,
      producibleCount,
      blockedCount,
      materials: readinessList.sort((a, b) => {
        // Prioritize BLOCKED first, then LOW, then READY, then UNKNOWN
        const rank = { BLOCKED: 0, LOW: 1, READY: 2, UNKNOWN: 3 }
        const rDiff = rank[a.status] - rank[b.status]
        if (rDiff !== 0) return rDiff
        return a.materialName.localeCompare(b.materialName)
      }),
      blockers,
    }
  }

  /**
   * Evaluates readiness for an individual production order (used in /admin/production)
   */
  public static async evaluateProductionOrderReadiness(
    productionOrder: {
      productId: string
      productNameSnapshot: string
      quantity: number
      completedQuantity?: number
    },
    storeId?: string | null
  ): Promise<{
    status: MaterialReadinessStatus
    materialName: string
    color: string | null
    requiredGrams: number
    availableGrams: number
    missingGrams: number
    badgeLabel: string
    isSufficient: boolean
  }> {
    const prod = MOCK_PRODUCTS.find((p) => p.id === productionOrder.productId)
    const costProfile = await getProductCostProfile(productionOrder.productId, storeId)

    let materialName = 'PLA'
    let color: string | null = null
    let weightGrams: number | null = null

    if (costProfile && costProfile.materialName) {
      materialName = costProfile.materialName
      weightGrams = costProfile.estimatedMaterialWeightGrams
      const parsed = this.parseProductMaterial({
        material: costProfile.materialName,
        name: costProfile.productName,
        weight: costProfile.estimatedMaterialWeightGrams,
      })
      color = parsed.color
    } else if (prod) {
      const parsed = this.parseProductMaterial(prod)
      materialName = parsed.materialName || 'PLA'
      color = parsed.color
      weightGrams = parsed.weightGrams
    }

    if (weightGrams === null || weightGrams <= 0) {
      return {
        status: 'UNKNOWN',
        materialName,
        color,
        requiredGrams: 0,
        availableGrams: 0,
        missingGrams: 0,
        badgeLabel: 'Malzeme: Bilinmiyor',
        isSufficient: false,
      }
    }

    const remainingToProduce = Math.max(
      0,
      productionOrder.quantity - (productionOrder.completedQuantity || 0)
    )
    const requiredGrams = remainingToProduce * weightGrams

    const stocks = await this.getMaterialStocks(storeId)
    const matchingStock = stocks.find((s) => {
      if (s.materialName.toUpperCase() !== materialName.toUpperCase()) return false
      if (color) {
        return (s.color || '').toUpperCase() === color.toUpperCase()
      }
      return true
    })

    const availableGrams = matchingStock ? matchingStock.quantityGrams : 0

    if (availableGrams < requiredGrams) {
      const missingGrams = requiredGrams - availableGrams
      return {
        status: 'BLOCKED',
        materialName,
        color,
        requiredGrams,
        availableGrams,
        missingGrams,
        badgeLabel: `Malzeme: ⚠ ${missingGrams}g eksik`,
        isSufficient: false,
      }
    }

    return {
      status: 'READY',
      materialName,
      color,
      requiredGrams,
      availableGrams,
      missingGrams: 0,
      badgeLabel: 'Malzeme: ✓ Hazır',
      isSufficient: true,
    }
  }

  /**
   * Resets in-memory stocks for testing neutrality
   */
  public static resetInMemoryStorage(): void {
    inMemoryStocks.clear()
    inMemoryMovements.clear()
    seenAdjustmentIdempotencyKeys.clear()

    for (const s of DEFAULT_INITIAL_STOCKS) {
      inMemoryStocks.set(s.id, { ...s })
      inMemoryMovements.set(s.id, [
        {
          id: `mov-init-${s.id}`,
          materialStockId: s.id,
          type: 'PURCHASE',
          quantityGrams: s.quantityGrams,
          previousQuantityGrams: 0,
          newQuantityGrams: s.quantityGrams,
          reason: 'Açılış stok kaydı',
          reference: 'INIT-2026',
          createdBy: 'system@zuulab.com',
          createdAt: s.createdAt,
        },
      ])
    }
  }
}
