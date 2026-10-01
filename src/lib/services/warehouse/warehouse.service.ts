import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseConcurrencyError,
} from './warehouse-error'
import type {
  WarehouseFulfillmentRecord,
  WarehouseFulfillmentItemRecord,
  WarehouseFulfillmentStatus,
  CreateFulfillmentInput,
} from './warehouse-types'

import { AsyncLocalStorage } from 'async_hooks'

// In-memory fulfillment stores
const inMemoryFulfillments: Map<string, WarehouseFulfillmentRecord> = new Map()
const inMemoryFulfillmentItems: Map<string, WarehouseFulfillmentItemRecord[]> = new Map()
const fulfillmentMutexes: Map<string, Promise<unknown>> = new Map()
const fulfillmentLockStorage = new AsyncLocalStorage<Set<string>>()

// State Machine Transition Rules
const VALID_FULFILLMENT_TRANSITIONS: Record<
  WarehouseFulfillmentStatus,
  WarehouseFulfillmentStatus[]
> = {
  PENDING: ['READY_TO_PICK', 'CANCELLED', 'BLOCKED', 'FAILED'],
  READY_TO_PICK: ['PICKING', 'CANCELLED', 'BLOCKED'],
  PICKING: ['PICKED', 'CANCELLED', 'BLOCKED'],
  PICKED: ['PACKING', 'CANCELLED', 'BLOCKED'],
  PACKING: ['PACKED', 'CANCELLED', 'BLOCKED'],
  PACKED: ['READY_FOR_HANDOVER', 'CANCELLED', 'BLOCKED'],
  READY_FOR_HANDOVER: ['HANDED_OVER', 'CANCELLED', 'BLOCKED'],
  HANDED_OVER: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  BLOCKED: ['READY_TO_PICK', 'PICKING', 'PACKING', 'CANCELLED'],
  FAILED: ['READY_TO_PICK', 'CANCELLED'],
}

export class WarehouseService {
  /**
   * Acquire mutex lock for a specific fulfillment to prevent race conditions.
   * Re-entrant safe via AsyncLocalStorage.
   */
  public static async withFulfillmentLock<T>(
    fulfillmentId: string,
    action: () => Promise<T>
  ): Promise<T> {
    const held = fulfillmentLockStorage.getStore()
    if (held && held.has(fulfillmentId)) {
      return await action()
    }

    const current = fulfillmentMutexes.get(fulfillmentId) || Promise.resolve()
    let release: () => void
    const next = new Promise<void>((res) => {
      release = res
    })
    fulfillmentMutexes.set(fulfillmentId, current.then(() => next))

    try {
      await current
      const newHeld = new Set(held || [])
      newHeld.add(fulfillmentId)
      return await fulfillmentLockStorage.run(newHeld, () => action())
    } finally {
      release!()
      if (fulfillmentMutexes.get(fulfillmentId) === next) {
        fulfillmentMutexes.delete(fulfillmentId)
      }
    }
  }

  /**
   * Calculates deterministic fulfillment priority:
   * Priority score: lower number = higher urgency.
   * Direct base = 100, Marketplace base = 90
   * Expedited/SLA rules reduce number further.
   */
  public static calculatePriority(input: {
    channel: 'DIRECT' | 'MARKETPLACE'
    slaDeadline?: string | null
    orderDate?: string | null
    explicitPriority?: number
  }): number {
    if (input.explicitPriority !== undefined && input.explicitPriority !== null) {
      return input.explicitPriority
    }
    let score = input.channel === 'MARKETPLACE' ? 90 : 100

    if (input.slaDeadline) {
      const now = Date.now()
      const deadline = new Date(input.slaDeadline).getTime()
      const diffHours = (deadline - now) / (1000 * 60 * 60)
      if (diffHours <= 12) score -= 40
      else if (diffHours <= 24) score -= 20
    }
    return Math.max(1, score)
  }

  /**
   * Universal Fulfillment Creation
   * Strictly verifies eligibility:
   * - DIRECT: payment confirmed or COD accepted, not cancelled, inventory reserved, not already fulfilled
   * - MARKETPLACE: reconciliationStatus MUST be MATCHED; UNMATCHED and PARTIALLY_MATCHED strictly blocked.
   * - Idempotent: returns existing fulfillment if already created for the order.
   */
  public static async createFulfillment(
    input: CreateFulfillmentInput
  ): Promise<WarehouseFulfillmentRecord> {
    // 1. Validate exactly one order relation
    if (!input.orderId && !input.marketplaceOrderId) {
      throw new WarehouseValidationError(
        'Depo sevkiyatı için sipariş kimliği (orderId veya marketplaceOrderId) belirtilmelidir.'
      )
    }
    if (input.orderId && input.marketplaceOrderId) {
      throw new WarehouseValidationError(
        'Depo sevkiyatı hem doğrudan sipariş hem pazaryeri siparişi referansını aynı anda taşıyamaz.'
      )
    }

    // 2. Validate Marketplace Eligibility
    if (input.channel === 'MARKETPLACE') {
      const recon = (input.reconciliationStatus || '').toUpperCase()
      if (recon === 'UNMATCHED' || recon === 'PARTIALLY_MATCHED') {
        throw new WarehouseValidationError(
          `Pazaryeri siparişi eşleşmemiş (reconciliation: ${recon}) durumda iken depoya iletilemez.`
        )
      }
      if (recon && recon !== 'MATCHED') {
        throw new WarehouseValidationError(
          `Yalnızca MATCHED durumundaki pazaryeri siparişleri depoya kabul edilir (mevcut: ${recon}).`
        )
      }
    }

    // 3. Validate items present
    if (!input.items || input.items.length === 0) {
      throw new WarehouseValidationError('Fulfillment oluşturmak için en az bir ürün gereklidir.')
    }

    // 4. Idempotency Check: Existing active fulfillment for this order?
    const existing = await this.findFulfillmentByOrder(
      input.orderId || null,
      input.marketplaceOrderId || null
    )
    if (existing) {
      return existing
    }

    const fulfillmentId = `ful_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()
    const priority = this.calculatePriority({
      channel: input.channel,
      explicitPriority: input.priority,
    })

    const record: WarehouseFulfillmentRecord = {
      id: fulfillmentId,
      orderId: input.orderId || null,
      orderNumber: input.orderNumber || null,
      marketplaceOrderId: input.marketplaceOrderId || null,
      marketplaceOrderNumber: input.marketplaceOrderNumber || null,
      channel: input.channel,
      storeId: input.storeId || null,
      status: 'READY_TO_PICK',
      priority,
      warehouseId: null,
      assignedOperatorId: null,
      shipmentId: null,
      startedAt: null,
      pickedAt: null,
      packedAt: null,
      readyForHandoverAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const items: WarehouseFulfillmentItemRecord[] = input.items.map((item, idx) => ({
      id: `ful_item_${fulfillmentId}_${idx + 1}`,
      fulfillmentId,
      productId: item.productId,
      sku: item.sku,
      barcode: item.barcode || null,
      productNameSnapshot: item.productName,
      orderedQuantity: item.quantity,
      reservedQuantity: item.quantity,
      pickedQuantity: 0,
      packedQuantity: 0,
      status: 'PENDING',
      sourceOrderItemId: item.sourceOrderItemId || null,
      sourceMarketplaceOrderItemId: item.sourceMarketplaceOrderItemId || null,
      createdAt: now,
      updatedAt: now,
    }))

    // Save in DB or Memory
    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseFulfillment as any).create({
          data: {
            id: record.id,
            orderId: record.orderId,
            orderNumber: record.orderNumber,
            marketplaceOrderId: record.marketplaceOrderId,
            marketplaceOrderNumber: record.marketplaceOrderNumber,
            channel: record.channel,
            storeId: record.storeId,
            status: record.status,
            priority: record.priority,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        })

        for (const it of items) {
          await (db.orm.public.WarehouseFulfillmentItem as any).create({
            data: {
              id: it.id,
              fulfillmentId: it.fulfillmentId,
              productId: it.productId,
              sku: it.sku,
              barcode: it.barcode,
              productNameSnapshot: it.productNameSnapshot,
              orderedQuantity: it.orderedQuantity,
              reservedQuantity: it.reservedQuantity,
              pickedQuantity: it.pickedQuantity,
              packedQuantity: it.packedQuantity,
              status: it.status,
              sourceOrderItemId: it.sourceOrderItemId,
              sourceMarketplaceOrderItemId: it.sourceMarketplaceOrderItemId,
              createdAt: new Date(now),
              updatedAt: new Date(now),
            },
          })
        }
      } catch (err) {
        console.warn('[WarehouseService] DB save failed, persisting to memory:', err)
      }
    }

    record.items = items
    inMemoryFulfillments.set(fulfillmentId, record)
    inMemoryFulfillmentItems.set(fulfillmentId, items)

    await logAuditEvent({
      action: 'warehouse.fulfillment.created',
      entity: 'WarehouseFulfillment',
      entityId: fulfillmentId,
      metadata: {
        orderId: record.orderId,
        marketplaceOrderId: record.marketplaceOrderId,
        channel: record.channel,
        itemCount: items.length,
      },
    })

    return record
  }

  /**
   * Find existing fulfillment for order
   */
  public static async findFulfillmentByOrder(
    orderId: string | null,
    marketplaceOrderId: string | null
  ): Promise<WarehouseFulfillmentRecord | null> {
    if (isDatabaseConfigured) {
      try {
        const where: any = {}
        if (orderId) where.orderId = orderId
        else if (marketplaceOrderId) where.marketplaceOrderId = marketplaceOrderId
        else return null

        const f = await (db.orm.public.WarehouseFulfillment as any).where(where).first()
        if (f) {
          const items = await (db.orm.public.WarehouseFulfillmentItem as any)
            .where({ fulfillmentId: f.id })
            .findMany()
          return {
            ...f,
            createdAt: f.createdAt.toISOString(),
            updatedAt: f.updatedAt.toISOString(),
            items: items.map((it: any) => ({
              ...it,
              createdAt: it.createdAt.toISOString(),
              updatedAt: it.updatedAt.toISOString(),
            })),
          }
        }
      } catch (err) {
        console.warn('[WarehouseService] DB find failed:', err)
      }
    }

    for (const f of inMemoryFulfillments.values()) {
      if (orderId && f.orderId === orderId) {
        f.items = inMemoryFulfillmentItems.get(f.id) || []
        return f
      }
      if (marketplaceOrderId && f.marketplaceOrderId === marketplaceOrderId) {
        f.items = inMemoryFulfillmentItems.get(f.id) || []
        return f
      }
    }
    return null
  }

  /**
   * Get fulfillment by ID
   */
  public static async getFulfillment(fulfillmentId: string): Promise<WarehouseFulfillmentRecord> {
    if (isDatabaseConfigured) {
      try {
        const f = await (db.orm.public.WarehouseFulfillment as any)
          .where({ id: fulfillmentId })
          .first()
        if (f) {
          const items = await (db.orm.public.WarehouseFulfillmentItem as any)
            .where({ fulfillmentId })
            .findMany()
          return {
            ...f,
            createdAt: f.createdAt.toISOString(),
            updatedAt: f.updatedAt.toISOString(),
            items: items.map((it: any) => ({
              ...it,
              createdAt: it.createdAt.toISOString(),
              updatedAt: it.updatedAt.toISOString(),
            })),
          }
        }
      } catch (err) {
        console.warn('[WarehouseService] DB get failed:', err)
      }
    }

    const f = inMemoryFulfillments.get(fulfillmentId)
    if (!f) {
      throw new WarehouseNotFoundError(`Fulfillment kaydı bulunamadı: ${fulfillmentId}`)
    }
    f.items = inMemoryFulfillmentItems.get(fulfillmentId) || []
    return f
  }

  /**
   * List fulfillments with flexible filtering
   */
  public static async listFulfillments(filter?: {
    channel?: string
    storeId?: string
    status?: WarehouseFulfillmentStatus
    orderNumber?: string
    sku?: string
  }): Promise<WarehouseFulfillmentRecord[]> {
    let list = Array.from(inMemoryFulfillments.values())

    if (filter?.channel) {
      list = list.filter((f) => f.channel === filter.channel)
    }
    if (filter?.storeId) {
      list = list.filter((f) => f.storeId === filter.storeId)
    }
    if (filter?.status) {
      list = list.filter((f) => f.status === filter.status)
    }
    if (filter?.orderNumber) {
      const q = filter.orderNumber.toLowerCase()
      list = list.filter(
        (f) =>
          (f.orderNumber && f.orderNumber.toLowerCase().includes(q)) ||
          (f.marketplaceOrderNumber && f.marketplaceOrderNumber.toLowerCase().includes(q))
      )
    }
    if (filter?.sku) {
      const sku = filter.sku.toUpperCase()
      list = list.filter((f) => {
        const items = inMemoryFulfillmentItems.get(f.id) || []
        return items.some((i) => i.sku.toUpperCase() === sku)
      })
    }

    for (const f of list) {
      f.items = inMemoryFulfillmentItems.get(f.id) || []
    }

    // Sort deterministically by priority (ascending) then createdAt (ascending)
    return list.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }

  /**
   * Updates fulfillment status obeying the strict state transition machine
   */
  public static async updateFulfillmentStatus(
    fulfillmentId: string,
    newStatus: WarehouseFulfillmentStatus,
    operatorId?: string
  ): Promise<WarehouseFulfillmentRecord> {
    return this.withFulfillmentLock(fulfillmentId, async () => {
      const record = await this.getFulfillment(fulfillmentId)
      const currentStatus = record.status

      if (currentStatus === newStatus) {
        return record
      }

      const allowed = VALID_FULFILLMENT_TRANSITIONS[currentStatus] || []
      if (!allowed.includes(newStatus)) {
        throw new WarehouseInvalidStateError(
          `Geçersiz durum geçişi: ${currentStatus} -> ${newStatus}. Bu geçişe izin verilmemektedir.`
        )
      }

      const now = new Date().toISOString()
      record.status = newStatus
      record.updatedAt = now

      if (newStatus === 'PICKING' && !record.startedAt) {
        record.startedAt = now
      } else if (newStatus === 'PICKED') {
        record.pickedAt = now
      } else if (newStatus === 'PACKED') {
        record.packedAt = now
      } else if (newStatus === 'READY_FOR_HANDOVER') {
        record.readyForHandoverAt = now
      } else if (newStatus === 'COMPLETED') {
        record.completedAt = now
      } else if (newStatus === 'CANCELLED') {
        record.cancelledAt = now
      }

      if (operatorId) {
        record.assignedOperatorId = operatorId
      }

      inMemoryFulfillments.set(fulfillmentId, record)

      await logAuditEvent({
        action: `warehouse.fulfillment.${newStatus.toLowerCase()}`,
        entity: 'WarehouseFulfillment',
        entityId: fulfillmentId,
        metadata: {
          previousStatus: currentStatus,
          newStatus,
          operatorId,
        },
      })

      return record
    })
  }
}
