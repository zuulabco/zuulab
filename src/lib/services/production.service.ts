import 'server-only'
import { logAuditEvent } from './admin.service'
import { adjustInventory, getInventoryStatus } from './inventory.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { db, isDatabaseConfigured } from '@/prisma/db'

export type ProductionStatus =
  | 'PLANNED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'STOCKED'
  | 'FAILED'
  | 'CANCELLED'

export type ProductionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface ProductionOrder {
  id: string
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  quantity: number
  completedQuantity: number
  acceptedQuantity: number
  failedQuantity: number
  status: ProductionStatus
  priority: ProductionPriority
  printerReference: string | null
  notes: string | null
  stockedIdempotencyKey: string | null
  createdBy: string
  startedAt: string | null
  completedAt: string | null
  stockedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProductionOrderInput {
  productId: string
  quantity: number
  priority?: ProductionPriority
  printerReference?: string
  notes?: string
  createdBy: string
}

export interface CompleteProductionInput {
  completedQuantity: number
  failedQuantity?: number
  notes?: string
}

export interface ProductCostBreakdown {
  productId: string
  productName: string
  sku: string
  estimatedMaterialWeightGrams: number
  materialCostPerKgTl: number
  materialCostTl: number
  packagingCostTl: number
  otherProductionCostTl: number
  totalProductionCostTl: number
  sellingPriceTl: number
  grossMarginTl: number
  grossMarginPercent: number
}

export interface ProductionSummary {
  totalOrders: number
  active: number
  queued: number
  planned: number
  completed: number
  stocked: number
  failed: number
  cancelled: number
  urgent: number
  totalUnitsProduced: number
  recentOrders: ProductionOrder[]
}

export interface LowStockProduct {
  productId: string
  productName: string
  sku: string
  currentStock: number
  allocatedStock: number
  availableStock: number
  minimumStock: number
  suggestedProductionQty: number
  printerReference: string | null
  hasActiveProduction: boolean
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STORAGE & HELPERS
// ─────────────────────────────────────────────────────────────

const inMemoryProductionOrders: Map<string, ProductionOrder> = new Map()

function generateId(): string {
  return 'prod-' + Date.now() + '-' + Math.floor(Math.random() * 10000)
}

function nowTs(): string {
  return new Date().toISOString()
}

// ─────────────────────────────────────────────────────────────
// STATE MACHINE TRANSITION RULES
// ─────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  PLANNED: ['QUEUED', 'IN_PROGRESS', 'CANCELLED'],
  QUEUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['STOCKED'],
  STOCKED: [],
  FAILED: [],
  CANCELLED: [],
}

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from] || []
  return allowed.includes(to)
}

// ─────────────────────────────────────────────────────────────
// CORE PRODUCTION OPERATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new production order.
 */
export async function createProductionOrder(
  input: CreateProductionOrderInput
): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
  if (!input.productId) {
    return { success: false, error: 'Ürün ID zorunludur.' }
  }
  if (!input.quantity || input.quantity <= 0) {
    return { success: false, error: 'Geçerli bir üretim miktarı girilmelidir (en az 1).' }
  }

  // Look up product snapshot
  let productName = 'Bilinmeyen Ürün'
  let sku = 'SKU-UNKNOWN'
  let printerRef = input.printerReference || null

  if (isDatabaseConfigured) {
    try {
      const prod = await db.orm.public.Product.where({ id: input.productId }).first()
      if (prod) {
        productName = prod.name
        sku = prod.sku
        if (!printerRef && (prod as any).printerReference) {
          printerRef = (prod as any).printerReference
        }
      }
    } catch {
      // fallback to mock
    }
  }

  if (productName === 'Bilinmeyen Ürün') {
    const mockProd = MOCK_PRODUCTS.find((p) => p.id === input.productId)
    if (mockProd) {
      productName = mockProd.name
      sku = mockProd.sku
      if (!printerRef && (mockProd as any).printerReference) {
        printerRef = (mockProd as any).printerReference
      }
    }
  }

  const id = generateId()
  const now = nowTs()

  const order: ProductionOrder = {
    id,
    productId: input.productId,
    productNameSnapshot: productName,
    skuSnapshot: sku,
    quantity: input.quantity,
    completedQuantity: 0,
    acceptedQuantity: 0,
    failedQuantity: 0,
    status: 'PLANNED',
    priority: input.priority || 'NORMAL',
    printerReference: printerRef,
    notes: input.notes || null,
    stockedIdempotencyKey: null,
    createdBy: input.createdBy,
    startedAt: null,
    completedAt: null,
    stockedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryProductionOrders.set(id, order)

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.create({
        id: order.id,
        productId: order.productId,
        productNameSnapshot: order.productNameSnapshot,
        skuSnapshot: order.skuSnapshot,
        quantity: order.quantity,
        completedQuantity: order.completedQuantity,
        acceptedQuantity: order.acceptedQuantity,
        failedQuantity: order.failedQuantity,
        status: order.status,
        priority: order.priority,
        printerReference: order.printerReference,
        notes: order.notes,
        createdBy: order.createdBy,
      })
    } catch (err) {
      console.warn('[production.service] DB save failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_CREATED',
    entity: 'ProductionOrder',
    entityId: id,
    userId: input.createdBy,
    metadata: {
      productId: input.productId,
      quantity: input.quantity,
      priority: order.priority,
      printerReference: order.printerReference,
    },
  })

  return { success: true, order }
}

/**
 * Transitions production order to IN_PROGRESS.
 */
export async function startProductionOrder(
  orderId: string,
  userId?: string
): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
  const order = inMemoryProductionOrders.get(orderId)
  if (!order) {
    return { success: false, error: 'Üretim emri bulunamadı: ' + orderId }
  }

  if (!canTransition(order.status, 'IN_PROGRESS')) {
    return {
      success: false,
      error:
        'Geçersiz durum geçişi: ' +
        order.status +
        ' -> IN_PROGRESS. Yalnızca PLANNED veya QUEUED durumundaki emirler başlatılabilir.',
    }
  }

  const now = nowTs()
  order.status = 'IN_PROGRESS'
  order.startedAt = now
  order.updatedAt = now

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
        status: 'IN_PROGRESS',
        startedAt: new Date(now),
        updatedAt: new Date(now),
      })
    } catch (err) {
      console.warn('[production.service] DB update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_STARTED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { orderId, startedAt: now },
  })

  return { success: true, order }
}

/**
 * Completes production with recorded completed and failed quantities.
 */
export async function completeProductionOrder(
  orderId: string,
  input: CompleteProductionInput,
  userId?: string
): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
  const order = inMemoryProductionOrders.get(orderId)
  if (!order) {
    return { success: false, error: 'Üretim emri bulunamadı: ' + orderId }
  }

  if (!canTransition(order.status, 'COMPLETED')) {
    return {
      success: false,
      error:
        'Geçersiz durum geçişi: ' +
        order.status +
        ' -> COMPLETED. Yalnızca IN_PROGRESS durumundaki emirler tamamlanabilir.',
    }
  }

  const completed = Number(input.completedQuantity || 0)
  const failed = Number(input.failedQuantity || 0)

  if (completed < 0 || failed < 0) {
    return { success: false, error: 'Üretim miktarları negatif olamaz.' }
  }

  const accepted = Math.max(0, completed - failed)
  const now = nowTs()

  // If entire batch failed and accepted is 0, allow transition to FAILED
  if (accepted === 0 && failed > 0) {
    order.status = 'FAILED'
    order.completedQuantity = completed
    order.acceptedQuantity = 0
    order.failedQuantity = failed
    order.completedAt = now
    order.updatedAt = now
    if (input.notes) {
      order.notes = order.notes ? order.notes + ' | ' + input.notes : input.notes
    }

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
          status: 'FAILED',
          completedQuantity: completed,
          acceptedQuantity: 0,
          failedQuantity: failed,
          completedAt: new Date(now),
          updatedAt: new Date(now),
          notes: order.notes,
        })
      } catch (err) {
        console.warn('[production.service] DB update failed:', err)
      }
    }

    await logAuditEvent({
      action: 'PRODUCTION_ORDER_FAILED_ON_COMPLETION',
      entity: 'ProductionOrder',
      entityId: orderId,
      userId: userId || null,
      metadata: { completed, failed, accepted: 0 },
    })

    return { success: true, order }
  }

  order.status = 'COMPLETED'
  order.completedQuantity = completed
  order.acceptedQuantity = accepted
  order.failedQuantity = failed
  order.completedAt = now
  order.updatedAt = now
  if (input.notes) {
    order.notes = order.notes ? order.notes + ' | ' + input.notes : input.notes
  }

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
        status: 'COMPLETED',
        completedQuantity: completed,
        acceptedQuantity: accepted,
        failedQuantity: failed,
        completedAt: new Date(now),
        updatedAt: new Date(now),
        notes: order.notes,
      })
    } catch (err) {
      console.warn('[production.service] DB update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_COMPLETED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { completed, accepted, failed },
  })

  return { success: true, order }
}

/**
 * Moves completed production goods into central inventory via adjustInventory().
 * CRITICAL INVARIANT: InventoryService is the sole authority for stock mutations.
 * Enforces idempotency via stockedIdempotencyKey to prevent duplicate stocking.
 */
export async function stockProductionOrder(
  orderId: string,
  userId?: string
): Promise<{
  success: boolean
  order?: ProductionOrder
  newStock?: number
  idempotent?: boolean
  error?: string
}> {
  const order = inMemoryProductionOrders.get(orderId)
  if (!order) {
    return { success: false, error: 'Üretim emri bulunamadı: ' + orderId }
  }

  const idempotencyKey = 'PRODUCTION_STOCK:' + order.id

  // Idempotency check: if already stocked, return safe no-op
  if (order.status === 'STOCKED' || order.stockedIdempotencyKey === idempotencyKey) {
    const inv = await getInventoryStatus(order.productId)
    return {
      success: true,
      order,
      newStock: inv.stock,
      idempotent: true,
    }
  }

  if (!canTransition(order.status, 'STOCKED')) {
    return {
      success: false,
      error:
        'Geçersiz durum geçişi: ' +
        order.status +
        ' -> STOCKED. Yalnızca COMPLETED durumundaki emirler stoğa alınabilir.',
    }
  }

  if (order.acceptedQuantity <= 0) {
    return {
      success: false,
      error: 'Stoğa eklenecek kabul edilmiş ürün miktarı bulunmuyor (acceptedQuantity: ' + order.acceptedQuantity + ').',
    }
  }

  // Adjust central inventory through official InventoryService authority
  const adjResult = await adjustInventory(order.productId, order.acceptedQuantity, {
    reason: 'Üretim Tamamlandı & Stoğa Alındı: ' + order.id,
    referenceId: order.id,
    idempotencyKey,
    transactionType: 'PRODUCTION_STOCK',
    adminUserId: userId || order.createdBy || 'system',
    metadata: {
      productionOrderId: order.id,
      sku: order.skuSnapshot,
      acceptedQuantity: order.acceptedQuantity,
      failedQuantity: order.failedQuantity,
    },
  })

  if (!adjResult.success) {
    return {
      success: false,
      error: 'Stok güncellenirken hata oluştu.',
    }
  }

  const now = nowTs()
  order.status = 'STOCKED'
  order.stockedAt = now
  order.stockedIdempotencyKey = idempotencyKey
  order.updatedAt = now

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
        status: 'STOCKED',
        stockedAt: new Date(now),
        stockedIdempotencyKey: idempotencyKey,
        updatedAt: new Date(now),
      })
    } catch (err) {
      console.warn('[production.service] DB stock update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_STOCKED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: {
      productId: order.productId,
      quantityAdded: order.acceptedQuantity,
      newStock: adjResult.newStock,
      idempotencyKey,
    },
  })

  return {
    success: true,
    order,
    newStock: adjResult.newStock,
    idempotent: false,
  }
}

/**
 * Fails a production order with a reason.
 */
export async function failProductionOrder(
  orderId: string,
  reason?: string,
  userId?: string
): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
  const order = inMemoryProductionOrders.get(orderId)
  if (!order) {
    return { success: false, error: 'Üretim emri bulunamadı: ' + orderId }
  }

  if (!canTransition(order.status, 'FAILED')) {
    return {
      success: false,
      error:
        'Geçersiz durum geçişi: ' +
        order.status +
        ' -> FAILED. Yalnızca IN_PROGRESS durumundaki emirler başarısız olarak işaretlenebilir.',
    }
  }

  const now = nowTs()
  order.status = 'FAILED'
  order.updatedAt = now
  if (reason) {
    order.notes = order.notes ? order.notes + ' | Hata: ' + reason : 'Hata: ' + reason
  }

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
        status: 'FAILED',
        updatedAt: new Date(now),
        notes: order.notes,
      })
    } catch (err) {
      console.warn('[production.service] DB fail update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_FAILED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { reason },
  })

  return { success: true, order }
}

/**
 * Cancels a production order.
 */
export async function cancelProductionOrder(
  orderId: string,
  reason?: string,
  userId?: string
): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
  const order = inMemoryProductionOrders.get(orderId)
  if (!order) {
    return { success: false, error: 'Üretim emri bulunamadı: ' + orderId }
  }

  if (!canTransition(order.status, 'CANCELLED')) {
    return {
      success: false,
      error:
        'Geçersiz durum geçişi: ' +
        order.status +
        ' -> CANCELLED. Bu durumdaki bir emir iptal edilemez.',
    }
  }

  const now = nowTs()
  order.status = 'CANCELLED'
  order.updatedAt = now
  if (reason) {
    order.notes = order.notes ? order.notes + ' | İptal: ' + reason : 'İptal: ' + reason
  }

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).ProductionOrder.where({ id: orderId }).update({
        status: 'CANCELLED',
        updatedAt: new Date(now),
        notes: order.notes,
      })
    } catch (err) {
      console.warn('[production.service] DB cancel update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_CANCELLED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { reason },
  })

  return { success: true, order }
}

/**
 * Retrieves production orders with optional filtering.
 */
export async function getProductionOrders(
  filter?: { status?: ProductionStatus; productId?: string }
): Promise<ProductionOrder[]> {
  let list = Array.from(inMemoryProductionOrders.values())

  if (filter?.status) {
    list = list.filter((o) => o.status === filter.status)
  }
  if (filter?.productId) {
    list = list.filter((o) => o.productId === filter.productId)
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Retrieves a single production order by ID.
 */
export async function getProductionOrderById(orderId: string): Promise<ProductionOrder | null> {
  const order = inMemoryProductionOrders.get(orderId)
  if (order) return order

  if (isDatabaseConfigured) {
    try {
      const dbOrder = await (db.orm.public as any).ProductionOrder.where({ id: orderId }).first()
      if (dbOrder) {
        const mapped: ProductionOrder = {
          id: dbOrder.id,
          productId: dbOrder.productId,
          productNameSnapshot: dbOrder.productNameSnapshot,
          skuSnapshot: dbOrder.skuSnapshot,
          quantity: dbOrder.quantity,
          completedQuantity: dbOrder.completedQuantity,
          acceptedQuantity: dbOrder.acceptedQuantity,
          failedQuantity: dbOrder.failedQuantity,
          status: dbOrder.status as ProductionStatus,
          priority: dbOrder.priority as ProductionPriority,
          printerReference: dbOrder.printerReference,
          notes: dbOrder.notes,
          stockedIdempotencyKey: dbOrder.stockedIdempotencyKey,
          createdBy: dbOrder.createdBy,
          startedAt: dbOrder.startedAt ? dbOrder.startedAt.toISOString() : null,
          completedAt: dbOrder.completedAt ? dbOrder.completedAt.toISOString() : null,
          stockedAt: dbOrder.stockedAt ? dbOrder.stockedAt.toISOString() : null,
          createdAt: dbOrder.createdAt.toISOString(),
          updatedAt: dbOrder.updatedAt.toISOString(),
        }
        inMemoryProductionOrders.set(mapped.id, mapped)
        return mapped
      }
    } catch {
      // ignore
    }
  }

  return null
}

/**
 * Calculates operational summary for dashboard and reporting.
 */
export async function getProductionSummary(): Promise<ProductionSummary> {
  const orders = Array.from(inMemoryProductionOrders.values())

  let active = 0
  let queued = 0
  let planned = 0
  let completed = 0
  let stocked = 0
  let failed = 0
  let cancelled = 0
  let urgent = 0
  let totalUnitsProduced = 0

  for (const o of orders) {
    if (o.status === 'IN_PROGRESS') active++
    else if (o.status === 'QUEUED') queued++
    else if (o.status === 'PLANNED') planned++
    else if (o.status === 'COMPLETED') completed++
    else if (o.status === 'STOCKED') stocked++
    else if (o.status === 'FAILED') failed++
    else if (o.status === 'CANCELLED') cancelled++

    if (o.priority === 'URGENT' && o.status !== 'STOCKED' && o.status !== 'CANCELLED') {
      urgent++
    }

    if (o.status === 'STOCKED' || o.status === 'COMPLETED') {
      totalUnitsProduced += o.acceptedQuantity
    }
  }

  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)

  return {
    totalOrders: orders.length,
    active,
    queued,
    planned,
    completed,
    stocked,
    failed,
    cancelled,
    urgent,
    totalUnitsProduced,
    recentOrders,
  }
}

/**
 * Calculates cost and margin metrics for a product.
 */
export async function calculateProductCost(
  productOrId: string | any
): Promise<ProductCostBreakdown | null> {
  let prod: any = null

  if (typeof productOrId === 'string') {
    if (isDatabaseConfigured) {
      try {
        prod = await db.orm.public.Product.where({ id: productOrId }).first()
      } catch {}
    }
    if (!prod) {
      prod = MOCK_PRODUCTS.find((p) => p.id === productOrId)
    }
  } else {
    prod = productOrId
  }

  if (!prod) return null

  const weightGrams = Number(prod.estimatedMaterialWeightGrams || 0)
  const costPerKg = Number(prod.materialCostPerKgTl || 600) // Default PLA cost 600 TL/kg
  const packagingCost = Number(prod.packagingCostTl || 0)
  const otherCost = Number(prod.otherProductionCostTl || 0)
  const sellingPrice = Number(prod.price || 0)

  const materialCost = (weightGrams / 1000) * costPerKg
  const totalProductionCost = materialCost + packagingCost + otherCost
  const grossMarginTl = sellingPrice - totalProductionCost
  const grossMarginPercent = sellingPrice > 0 ? (grossMarginTl / sellingPrice) * 100 : 0

  return {
    productId: prod.id,
    productName: prod.name,
    sku: prod.sku,
    estimatedMaterialWeightGrams: Math.round(weightGrams * 100) / 100,
    materialCostPerKgTl: costPerKg,
    materialCostTl: Math.round(materialCost * 100) / 100,
    packagingCostTl: Math.round(packagingCost * 100) / 100,
    otherProductionCostTl: Math.round(otherCost * 100) / 100,
    totalProductionCostTl: Math.round(totalProductionCost * 100) / 100,
    sellingPriceTl: Math.round(sellingPrice * 100) / 100,
    grossMarginTl: Math.round(grossMarginTl * 100) / 100,
    grossMarginPercent: Math.round(grossMarginPercent * 10) / 10,
  }
}

/**
 * Identifies products below minimum stock threshold and checks active production.
 */
export async function getLowStockProductsForProduction(): Promise<LowStockProduct[]> {
  const lowStockList: LowStockProduct[] = []

  // Check active production orders
  const activeProdSet = new Set<string>()
  for (const o of inMemoryProductionOrders.values()) {
    if (o.status === 'PLANNED' || o.status === 'QUEUED' || o.status === 'IN_PROGRESS') {
      activeProdSet.add(o.productId)
    }
  }

  // Live catalog stock (products.stock is the sellable quantity).
  const products = await db.orm.public.Product
    .select('id', 'name', 'sku', 'stock', 'minimumStock', 'lowStockThreshold', 'printerReference', 'isActive')
    .where({ isActive: true })
    .all()

  for (const prod of products) {
    const minStock = prod.minimumStock > 0 ? prod.minimumStock : prod.lowStockThreshold || 5
    if (prod.stock < minStock) {
      lowStockList.push({
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        currentStock: prod.stock,
        allocatedStock: 0,
        availableStock: prod.stock,
        minimumStock: minStock,
        suggestedProductionQty: Math.max(minStock * 2 - prod.stock, minStock),
        printerReference: prod.printerReference || null,
        hasActiveProduction: activeProdSet.has(prod.id),
      })
    }
  }

  return lowStockList.sort((a, b) => a.availableStock - b.availableStock)
}
