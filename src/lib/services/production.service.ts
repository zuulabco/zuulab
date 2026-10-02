import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { refreshCatalogStock } from '@/lib/cache/catalog-cache'
import { logAuditEvent } from './admin.service'
import { applyMaterialMovement } from './material.service'

/**
 * 3D print jobs that restock products (ZUULAB sells from stock).
 *
 *   PLANNED/QUEUED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED ──stock──▶ STOCKED
 *                                   │                       (all failed → FAILED)
 *                                   └──fail──▶ FAILED        any open ──cancel──▶ CANCELLED
 *
 * Each transition is a compare-and-set on the status, so a double click or a retried
 * request applies it once. Completing deducts the filament used (printed pieces ×
 * grams per piece) and stocking adds the good pieces to the product's stock; both
 * write ledger rows under idempotency keys.
 */

export type ProductionStatus = 'PLANNED' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'STOCKED' | 'FAILED' | 'CANCELLED'
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
  materialStockId: string | null
  materialLabel: string | null
  gramsPerUnit: number | null
  /** quantity × grams per piece; null when either is unknown */
  requiredGrams: number | null
  materialConsumedGrams: number | null
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
  materialStockId?: string | null
  gramsPerUnit?: number | null
  createdBy: string
}

export interface CompleteProductionInput {
  /** Pieces printed, good and failed together */
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

type Result = { success: boolean; order?: ProductionOrder; error?: string }

const ALLOWED_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  PLANNED: ['QUEUED', 'IN_PROGRESS', 'CANCELLED'],
  QUEUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['STOCKED'],
  STOCKED: [],
  FAILED: [],
  CANCELLED: [],
}

const STATUS_LABEL: Record<ProductionStatus, string> = {
  PLANNED: 'Planlandı',
  QUEUED: 'Sırada',
  IN_PROGRESS: 'Basılıyor',
  COMPLETED: 'Tamamlandı',
  STOCKED: 'Stoğa alındı',
  FAILED: 'Başarısız',
  CANCELLED: 'İptal',
}

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

const OPEN: ProductionStatus[] = ['PLANNED', 'QUEUED', 'IN_PROGRESS']

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100
}

type Row = {
  id: string
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  quantity: number
  completedQuantity: number
  acceptedQuantity: number
  failedQuantity: number
  status: string
  priority: string
  printerReference: string | null
  notes: string | null
  materialStockId: string | null
  gramsPerUnit: unknown
  materialConsumedGrams: unknown
  stockedIdempotencyKey: string | null
  createdBy: string
  startedAt: unknown
  completedAt: unknown
  stockedAt: unknown
  createdAt: unknown
  updatedAt: unknown
}

async function materialLabels(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.orm.public.MaterialStock.where((m) => m.id.in(ids)).select('id', 'materialName', 'color').all()
  return new Map(rows.map((m) => [m.id, `${m.materialName}${m.color ? ` ${m.color}` : ''}`]))
}

function toOrder(row: Row, labels: Map<string, string>): ProductionOrder {
  const gramsPerUnit = num(row.gramsPerUnit)
  return {
    id: row.id,
    productId: row.productId,
    productNameSnapshot: row.productNameSnapshot,
    skuSnapshot: row.skuSnapshot,
    quantity: row.quantity,
    completedQuantity: row.completedQuantity,
    acceptedQuantity: row.acceptedQuantity,
    failedQuantity: row.failedQuantity,
    status: row.status as ProductionStatus,
    priority: row.priority as ProductionPriority,
    printerReference: row.printerReference,
    notes: row.notes,
    materialStockId: row.materialStockId,
    materialLabel: row.materialStockId ? labels.get(row.materialStockId) ?? null : null,
    gramsPerUnit,
    requiredGrams: gramsPerUnit === null ? null : Math.round(row.quantity * gramsPerUnit * 100) / 100,
    materialConsumedGrams: num(row.materialConsumedGrams),
    stockedIdempotencyKey: row.stockedIdempotencyKey,
    createdBy: row.createdBy,
    startedAt: dbTimestampToIso(row.startedAt),
    completedAt: dbTimestampToIso(row.completedAt),
    stockedAt: dbTimestampToIso(row.stockedAt),
    createdAt: dbTimestampToIso(row.createdAt) ?? '',
    updatedAt: dbTimestampToIso(row.updatedAt) ?? '',
  }
}

async function load(id: string): Promise<ProductionOrder | null> {
  const row = (await db.orm.public.ProductionOrder.where({ id }).first()) as Row | null
  if (!row) return null
  return toOrder(row, await materialLabels(row.materialStockId ? [row.materialStockId] : []))
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Moves the job from one of `from` to `to` with extra column changes; false if another request already moved it. */
async function transition(tx: Tx, id: string, from: ProductionStatus[], to: ProductionStatus, extra: Record<string, unknown> = {}): Promise<boolean> {
  const current = await tx.orm.public.ProductionOrder.where({ id }).select('status').first()
  if (!current || !from.includes(current.status as ProductionStatus)) return false
  const { affectedRows } = await tx.execute(
    db.raw.sql`UPDATE production_orders SET status = ${to}::"ProductionStatus", updated_at = now()
      WHERE id = ${id} AND status = ${current.status}::"ProductionStatus"`
      .affectedCount()
      .build()
  )
  if (affectedRows !== 1) return false
  if (Object.keys(extra).length) await tx.orm.public.ProductionOrder.where({ id }).update(extra as never)
  return true
}

function transitionError(order: ProductionOrder, to: ProductionStatus): string {
  return `Bu iş "${STATUS_LABEL[order.status]}" durumunda; "${STATUS_LABEL[to]}" yapılamaz.`
}

function appendNote(existing: string | null, note: string | undefined | null): string | null {
  if (!note?.trim()) return existing
  return existing ? `${existing} | ${note.trim()}` : note.trim()
}

// ─────────────────────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────────────────────

export async function createProductionOrder(input: CreateProductionOrderInput): Promise<Result> {
  if (!input.productId) return { success: false, error: 'Ürün seçilmelidir.' }
  const quantity = Number(input.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) return { success: false, error: 'Adet en az 1 olmalıdır.' }
  const product = await db.orm.public.Product.where({ id: input.productId })
    .select('id', 'name', 'sku', 'printerReference', 'estimatedMaterialWeightGrams')
    .first()
  if (!product) return { success: false, error: 'Ürün bulunamadı.' }

  // Filament and grams per piece: as given, else what the product's previous job used.
  const previous = await db.orm.public.ProductionOrder.where({ productId: product.id })
    .orderBy((o) => o.createdAt.desc())
    .select('materialStockId', 'gramsPerUnit')
    .first()
  let materialStockId = input.materialStockId || null
  if (!materialStockId && input.materialStockId === undefined) materialStockId = previous?.materialStockId ?? null
  if (materialStockId && !(await db.orm.public.MaterialStock.where({ id: materialStockId }).select('id').first())) {
    return { success: false, error: 'Seçilen filament bulunamadı.' }
  }
  const gramsPerUnit =
    input.gramsPerUnit !== undefined && input.gramsPerUnit !== null && String(input.gramsPerUnit) !== ''
      ? Number(input.gramsPerUnit)
      : product.estimatedMaterialWeightGrams ?? num(previous?.gramsPerUnit)
  if (gramsPerUnit !== null && (!Number.isFinite(gramsPerUnit) || gramsPerUnit < 0)) {
    return { success: false, error: 'Parça başı gram geçerli bir sayı olmalıdır.' }
  }

  const created = await db.orm.public.ProductionOrder.create({
    productId: product.id,
    productNameSnapshot: product.name,
    skuSnapshot: product.sku,
    quantity,
    status: 'PLANNED',
    priority: input.priority || 'NORMAL',
    printerReference: input.printerReference?.trim() || product.printerReference || null,
    notes: input.notes?.trim() || null,
    materialStockId,
    gramsPerUnit: gramsPerUnit === null ? null : dbNumeric(gramsPerUnit),
    createdBy: input.createdBy,
  } as never)
  const id = (created as { id: string }).id

  await logAuditEvent({
    action: 'PRODUCTION_ORDER_CREATED',
    entity: 'ProductionOrder',
    entityId: id,
    userId: input.createdBy,
    metadata: { productId: product.id, quantity, materialStockId, gramsPerUnit },
  })
  return { success: true, order: (await load(id))! }
}

export async function startProductionOrder(orderId: string, userId?: string): Promise<Result> {
  const order = await load(orderId)
  if (!order) return { success: false, error: 'Üretim işi bulunamadı.' }
  const moved = await db.transaction((tx) =>
    transition(tx, orderId, ['PLANNED', 'QUEUED'], 'IN_PROGRESS', { startedAt: toDbTimestamp() })
  )
  if (!moved) return { success: false, error: transitionError(order, 'IN_PROGRESS') }
  await logAuditEvent({ action: 'PRODUCTION_ORDER_STARTED', entity: 'ProductionOrder', entityId: orderId, userId: userId || null })
  return { success: true, order: (await load(orderId))! }
}

/**
 * Records what came off the printer. Filament for every printed piece (good or
 * failed) is deducted from the job's filament; all pieces failed → FAILED.
 */
export async function completeProductionOrder(orderId: string, input: CompleteProductionInput, userId?: string): Promise<Result> {
  const order = await load(orderId)
  if (!order) return { success: false, error: 'Üretim işi bulunamadı.' }
  const printed = Number(input.completedQuantity)
  const failed = Number(input.failedQuantity ?? 0)
  if (!Number.isInteger(printed) || !Number.isInteger(failed) || printed < 0 || failed < 0) {
    return { success: false, error: 'Adetler 0 veya pozitif tam sayı olmalıdır.' }
  }
  if (printed === 0) return { success: false, error: 'Basılan adet en az 1 olmalıdır.' }
  if (failed > printed) return { success: false, error: 'Hatalı adet, basılan adetten fazla olamaz.' }
  const accepted = printed - failed
  const target: ProductionStatus = accepted === 0 ? 'FAILED' : 'COMPLETED'
  const consumed = order.gramsPerUnit === null ? null : Math.round(printed * order.gramsPerUnit * 100) / 100

  const moved = await db.transaction(async (tx) => {
    const ok = await transition(tx, orderId, ['IN_PROGRESS'], target, {
      completedQuantity: printed,
      acceptedQuantity: accepted,
      failedQuantity: failed,
      completedAt: toDbTimestamp(),
      notes: appendNote(order.notes, input.notes),
      materialConsumedGrams: consumed === null ? null : dbNumeric(consumed),
    })
    if (!ok) return false
    if (order.materialStockId && consumed && consumed > 0) {
      await applyMaterialMovement(tx, {
        materialStockId: order.materialStockId,
        deltaGrams: -consumed,
        type: 'PRODUCTION_CONSUMPTION',
        reason: `Üretim: ${order.productNameSnapshot} × ${printed} (${failed} hatalı)`,
        reference: orderId,
        idempotencyKey: `PRODUCTION_MATERIAL:${orderId}`,
        createdBy: userId || 'system',
      })
    }
    return true
  })
  if (!moved) return { success: false, error: transitionError(order, 'COMPLETED') }

  await logAuditEvent({
    action: target === 'FAILED' ? 'PRODUCTION_ORDER_FAILED_ON_COMPLETION' : 'PRODUCTION_ORDER_COMPLETED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { printed, accepted, failed, consumedGrams: consumed },
  })
  return { success: true, order: (await load(orderId))! }
}

/** Adds the good pieces of a completed job to the product's stock, exactly once. */
export async function stockProductionOrder(
  orderId: string,
  userId?: string
): Promise<{ success: boolean; order?: ProductionOrder; newStock?: number; idempotent?: boolean; error?: string }> {
  const order = await load(orderId)
  if (!order) return { success: false, error: 'Üretim işi bulunamadı.' }
  const idempotencyKey = `PRODUCTION_STOCK:${orderId}`
  if (order.status === 'STOCKED') {
    const product = await db.orm.public.Product.where({ id: order.productId }).select('stock').first()
    return { success: true, order, newStock: product?.stock, idempotent: true }
  }
  if (order.acceptedQuantity <= 0) return { success: false, error: 'Stoğa eklenecek sağlam parça yok.' }

  const newStock = await db.transaction(async (tx) => {
    const ok = await transition(tx, orderId, ['COMPLETED'], 'STOCKED', { stockedAt: toDbTimestamp(), stockedIdempotencyKey: idempotencyKey })
    if (!ok) return null
    const [row] = (await tx.query(
      db.raw.sql`SELECT stock, sku FROM products WHERE id = ${order.productId} FOR UPDATE`
        .returnsRow({ stock: 'pg/int4@1', sku: 'pg/text@1' } as never)
        .build()
    )) as unknown as Array<{ stock: number; sku: string }>
    if (!row) throw new Error('Ürün bulunamadı.')
    const next = Number(row.stock) + order.acceptedQuantity
    await tx.execute(
      db.raw.sql`UPDATE products SET stock = ${next}, updated_at = now() WHERE id = ${order.productId}`.affectedCount().build()
    )
    await tx.orm.public.InventoryTransaction.create({
      productId: order.productId,
      sku: row.sku,
      changeQuantity: order.acceptedQuantity,
      previousStock: Number(row.stock),
      newStock: next,
      previousReserved: 0,
      newReserved: 0,
      type: 'PRODUCTION_STOCK',
      reason: `Üretim stoğa alındı (${order.acceptedQuantity} adet)`,
      idempotencyKey,
      metadata: { productionOrderId: orderId, changedBy: userId || 'system' } as never,
    })
    return next
  })
  if (newStock === null) return { success: false, error: transitionError(order, 'STOCKED') }

  refreshCatalogStock()
  await logAuditEvent({
    action: 'PRODUCTION_ORDER_STOCKED',
    entity: 'ProductionOrder',
    entityId: orderId,
    userId: userId || null,
    metadata: { productId: order.productId, quantityAdded: order.acceptedQuantity, newStock },
  })
  return { success: true, order: (await load(orderId))!, newStock, idempotent: false }
}

export async function failProductionOrder(orderId: string, reason?: string, userId?: string): Promise<Result> {
  const order = await load(orderId)
  if (!order) return { success: false, error: 'Üretim işi bulunamadı.' }
  const moved = await db.transaction((tx) =>
    transition(tx, orderId, ['IN_PROGRESS'], 'FAILED', { notes: appendNote(order.notes, reason ? `Hata: ${reason}` : null) })
  )
  if (!moved) return { success: false, error: transitionError(order, 'FAILED') }
  await logAuditEvent({ action: 'PRODUCTION_ORDER_FAILED', entity: 'ProductionOrder', entityId: orderId, userId: userId || null, metadata: { reason } })
  return { success: true, order: (await load(orderId))! }
}

export async function cancelProductionOrder(orderId: string, reason?: string, userId?: string): Promise<Result> {
  const order = await load(orderId)
  if (!order) return { success: false, error: 'Üretim işi bulunamadı.' }
  const moved = await db.transaction((tx) =>
    transition(tx, orderId, OPEN, 'CANCELLED', { notes: appendNote(order.notes, reason ? `İptal: ${reason}` : null) })
  )
  if (!moved) return { success: false, error: transitionError(order, 'CANCELLED') }
  await logAuditEvent({ action: 'PRODUCTION_ORDER_CANCELLED', entity: 'ProductionOrder', entityId: orderId, userId: userId || null, metadata: { reason } })
  return { success: true, order: (await load(orderId))! }
}

// ─────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────

export async function getProductionOrders(filter?: { status?: ProductionStatus; productId?: string }): Promise<ProductionOrder[]> {
  let rows = (await db.orm.public.ProductionOrder.orderBy((o) => o.createdAt.desc()).all()) as Row[]
  if (filter?.status) rows = rows.filter((r) => r.status === filter.status)
  if (filter?.productId) rows = rows.filter((r) => r.productId === filter.productId)
  const labels = await materialLabels([...new Set(rows.map((r) => r.materialStockId).filter((id): id is string => Boolean(id)))])
  return rows.map((r) => toOrder(r, labels))
}

export async function getProductionOrderById(orderId: string): Promise<ProductionOrder | null> {
  return load(orderId)
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  const orders = await getProductionOrders()
  const count = (s: ProductionStatus) => orders.filter((o) => o.status === s).length
  return {
    totalOrders: orders.length,
    active: count('IN_PROGRESS'),
    queued: count('QUEUED'),
    planned: count('PLANNED'),
    completed: count('COMPLETED'),
    stocked: count('STOCKED'),
    failed: count('FAILED'),
    cancelled: count('CANCELLED'),
    urgent: orders.filter((o) => o.priority === 'URGENT' && OPEN.includes(o.status)).length,
    totalUnitsProduced: orders.filter((o) => o.status === 'STOCKED' || o.status === 'COMPLETED').reduce((s, o) => s + o.acceptedQuantity, 0),
    recentOrders: orders.slice(0, 10),
  }
}

/** Cost and margin per product from its cost fields (no invented defaults). */
export async function calculateProductCost(productOrId: string | Record<string, unknown>): Promise<ProductCostBreakdown | null> {
  const prod = (typeof productOrId === 'string'
    ? await db.orm.public.Product.where({ id: productOrId }).first()
    : productOrId) as Record<string, unknown> | null
  if (!prod) return null
  const weightGrams = Number(prod.estimatedMaterialWeightGrams ?? 0)
  const costPerKg = Number(prod.materialCostPerKgTl ?? 0)
  const packagingCost = Number(prod.packagingCostTl ?? 0)
  const otherCost = Number(prod.otherProductionCostTl ?? 0)
  const sellingPrice = Number(prod.price ?? 0)
  const materialCost = (weightGrams / 1000) * costPerKg
  const total = materialCost + packagingCost + otherCost
  const margin = sellingPrice - total
  const r2 = (v: number) => Math.round(v * 100) / 100
  return {
    productId: String(prod.id),
    productName: String(prod.name),
    sku: String(prod.sku),
    estimatedMaterialWeightGrams: r2(weightGrams),
    materialCostPerKgTl: costPerKg,
    materialCostTl: r2(materialCost),
    packagingCostTl: r2(packagingCost),
    otherProductionCostTl: r2(otherCost),
    totalProductionCostTl: r2(total),
    sellingPriceTl: r2(sellingPrice),
    grossMarginTl: r2(margin),
    grossMarginPercent: sellingPrice > 0 ? Math.round((margin / sellingPrice) * 1000) / 10 : 0,
  }
}

/** Active products below their minimum (or low-stock threshold): what to print next. */
export async function getLowStockProductsForProduction(): Promise<LowStockProduct[]> {
  const open = await db.orm.public.ProductionOrder.where((o) => o.status.in(OPEN as never)).select('productId', 'quantity').all()
  const inProduction = new Map<string, number>()
  for (const o of open) inProduction.set(o.productId, (inProduction.get(o.productId) ?? 0) + o.quantity)

  const products = await db.orm.public.Product
    .select('id', 'name', 'sku', 'stock', 'minimumStock', 'lowStockThreshold', 'printerReference')
    .where({ isActive: true })
    .all()

  return products
    .map((p) => {
      const minStock = p.minimumStock > 0 ? p.minimumStock : p.lowStockThreshold || 5
      const coming = inProduction.get(p.id) ?? 0
      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        currentStock: p.stock,
        allocatedStock: coming,
        availableStock: p.stock,
        minimumStock: minStock,
        // Up to twice the minimum, minus what is already being printed.
        suggestedProductionQty: Math.max(minStock * 2 - p.stock - coming, 0),
        printerReference: p.printerReference || null,
        hasActiveProduction: coming > 0,
      }
    })
    .filter((p) => p.currentStock < p.minimumStock)
    .sort((a, b) => a.availableStock - b.availableStock)
}
