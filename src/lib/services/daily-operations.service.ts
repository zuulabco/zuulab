import 'server-only'
import { getInventoryStatus } from './inventory.service'
import {
  getProductionOrders,
  getLowStockProductsForProduction,
  type ProductionOrder,
  type LowStockProduct,
} from './production.service'
import { getAllOrders, type StoredOrder } from './orders.service'
import { getMarketplaceOrders } from './marketplace/marketplace.service'
import type { MarketplaceOrder } from './marketplace/marketplace.interface'
import { ShippingService } from './shipping/shipping.service'
import { BulkShippingService, type ShippingDailyStats } from './shipping/bulk-shipping.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { MaterialService, type MaterialReadinessSummary } from './material.service'

export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3'
export type PriorityLevelLabel = 'ACİL' | 'BUGÜN' | 'KRİTİK STOK' | 'NORMAL'

export interface TodayDateInfo {
  isoDate: string // e.g. "2026-09-29"
  formattedDate: string // e.g. "29 Eylül 2026"
  formattedDay: string // e.g. "Pazartesi"
  formattedFull: string // e.g. "29 Eylül 2026, Pazartesi"
  timezone: 'Europe/Istanbul'
  startOfDayIso: string
  endOfDayIso: string
}

export interface TodaySummaryKpi {
  kargoGonderilecek: number
  uretimUretilecek: number
  kritikStokUrun: number
  bekleyenSiparis: number
}

export interface ActionablePriorityItem {
  id: string
  level: PriorityLevel
  levelLabel: PriorityLevelLabel
  badge: string
  title: string
  description: string
  actionLabel: string
  actionHref: string
  count: number
  deterministicRank: number
}

export interface ProductionRecommendationItem {
  productId: string
  productName: string
  sku: string
  orderDemand: number
  physicalStock: number
  reservedStock: number
  availableStock: number
  requiredProduction: number
  priority: PriorityLevel
  priorityLabel: PriorityLevelLabel
  hasActiveProduction: boolean
  activeProductionStatus?: string | null
  activeProductionQty?: number
  printerReference?: string | null
  actionUrl: string
}

export interface OrderBlockerItem {
  orderId: string
  orderNumber: string
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId?: string | null
  customerName: string
  createdAt: string
  items: Array<{
    productId: string
    productName: string
    sku: string
    quantity: number
    availableStock: number
    physicalStock: number
    reservedStock: number
    missingQuantity: number
    hasStockShortage: boolean
  }>
  blockerReason: string
  hasActiveProduction: boolean
  activeProductionOrder?: {
    id: string
    status: string
    quantity: number
    completedQuantity: number
  } | null
  actionUrl: string
  actionLabel: string
  priority: 'P0' | 'P1'
}

export interface TodayShippingSummary {
  stats: ShippingDailyStats
  shipments: Array<{
    id: string
    orderNumber: string
    channel: 'DIRECT' | 'MARKETPLACE'
    carrier: string
    provider: string
    trackingNumber: string | null
    status: string
    labelReady: boolean
    createdAt: string
  }>
}

export interface ActiveProductionItem {
  id: string
  productId: string
  productName: string
  sku: string
  quantity: number
  completedQuantity: number
  acceptedQuantity: number
  failedQuantity: number
  status: string
  priority: string
  printerReference: string | null
  progressPercent: number
  createdAt: string
}

export interface TodayOperationsData {
  date: TodayDateInfo
  summary: TodaySummaryKpi
  priorities: ActionablePriorityItem[]
  production: {
    recommendations: ProductionRecommendationItem[]
    active: ActiveProductionItem[]
    totalActiveJobs: number
    totalUnitsToProduce: number
  }
  shipping: TodayShippingSummary
  blockers: OrderBlockerItem[]
  lowStock: Array<
    LowStockProduct & {
      actionUrl: string
    }
  >
  materials: MaterialReadinessSummary
}

export class DailyOperationsService {
  /**
   * Generates deterministic date information adhering strictly to Europe/Istanbul timezone
   */
  public static getTodayDateInfo(referenceDate = new Date()): TodayDateInfo {
    const tz = 'Europe/Istanbul'

    // Formatter for ISO-like year-month-day in Europe/Istanbul
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(referenceDate) // e.g. "2026-09-29"

    const formattedDate = new Intl.DateTimeFormat('tr-TR', {
      timeZone: tz,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(referenceDate) // e.g. "29 Eylül 2026"

    const formattedDay = new Intl.DateTimeFormat('tr-TR', {
      timeZone: tz,
      weekday: 'long',
    }).format(referenceDate) // e.g. "Pazartesi"

    const startOfDayIso = `${parts}T00:00:00.000+03:00`
    const endOfDayIso = `${parts}T23:59:59.999+03:00`

    return {
      isoDate: parts,
      formattedDate,
      formattedDay,
      formattedFull: `${formattedDate}, ${formattedDay}`,
      timezone: tz,
      startOfDayIso,
      endOfDayIso,
    }
  }

  /**
   * Retrieves active open orders for the specified store context
   */
  private static async getOpenOrders(storeId?: string | null): Promise<
    Array<{
      orderId: string
      orderNumber: string
      channel: 'DIRECT' | 'MARKETPLACE'
      storeId?: string | null
      customerName: string
      createdAt: string
      status: string
      items: Array<{
        productId: string
        productName: string
        sku: string
        quantity: number
      }>
    }>
  > {
    const openOrders: Array<{
      orderId: string
      orderNumber: string
      channel: 'DIRECT' | 'MARKETPLACE'
      storeId?: string | null
      customerName: string
      createdAt: string
      status: string
      items: Array<{
        productId: string
        productName: string
        sku: string
        quantity: number
      }>
    }> = []

    // 1. Direct Storefront Orders
    const directOrders = await getAllOrders()
    for (const ord of directOrders) {
      // Check multi-store scoping if order has storeId attached
      const ordStoreId = (ord as any).storeId || null
      if (storeId && ordStoreId && ordStoreId !== storeId) {
        continue
      }
      // If storeId is specified and not matching direct orders
      if (storeId && !ordStoreId && storeId !== 'store_main') {
        // Specific marketplace store user does not see main direct orders
        continue
      }

      const openStatuses = ['PAYMENT_PENDING', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING']
      if (openStatuses.includes(ord.status)) {
        openOrders.push({
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          channel: 'DIRECT',
          storeId: ordStoreId,
          customerName: ord.shippingAddressSnapshot?.fullName || 'Müşteri',
          createdAt: ord.createdAt,
          status: ord.status,
          items: ord.items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            sku: i.sku,
            quantity: i.quantity,
          })),
        })
      }
    }

    // 2. Marketplace Orders
    const marketplaceOrders = await getMarketplaceOrders(storeId ? { storeId } : {})
    for (const mOrd of marketplaceOrders) {
      if (storeId && mOrd.storeId !== storeId) {
        continue
      }
      const openStatuses = ['NEW', 'APPROVED', 'PREPARING', 'UNMAPPED']
      if (openStatuses.includes(mOrd.status)) {
        const mappedItems = mOrd.items
          .filter((i) => Boolean(i.productId))
          .map((i) => ({
            productId: i.productId!,
            productName: i.productName,
            sku: i.merchantSku || i.externalSku,
            quantity: i.quantity,
          }))

        if (mappedItems.length > 0) {
          openOrders.push({
            orderId: mOrd.id,
            orderNumber: mOrd.externalOrderNumber,
            channel: 'MARKETPLACE',
            storeId: mOrd.storeId,
            customerName: mOrd.customerName,
            createdAt: mOrd.createdAt || mOrd.orderDate,
            status: mOrd.status,
            items: mappedItems,
          })
        }
      }
    }

    // Deterministic FIFO: createdAt ASC
    return openOrders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * Production Recommendations Engine
   * Calculates demand vs authoritative inventory with zero double-counting
   */
  public static async getProductionRecommendations(
    storeId?: string | null
  ): Promise<ProductionRecommendationItem[]> {
    const openOrders = await this.getOpenOrders(storeId)
    const activeProduction = await getProductionOrders()

    // Map active production jobs
    const activeByProduct = new Map<string, { count: number; qty: number; status: string }>()
    for (const p of activeProduction) {
      if (['QUEUED', 'IN_PROGRESS', 'PLANNED'].includes(p.status)) {
        const cur = activeByProduct.get(p.productId) || { count: 0, qty: 0, status: p.status }
        cur.count++
        cur.qty += p.quantity - p.completedQuantity
        cur.status = p.status
        activeByProduct.set(p.productId, cur)
      }
    }

    // 1. Calculate open order demand per productId
    const demandMap = new Map<string, { demand: number; productName: string; sku: string }>()
    for (const ord of openOrders) {
      for (const item of ord.items) {
        const cur = demandMap.get(item.productId) || {
          demand: 0,
          productName: item.productName,
          sku: item.sku,
        }
        cur.demand += item.quantity
        demandMap.set(item.productId, cur)
      }
    }

    // 2. Fetch authoritative inventory for known products
    const recommendations: ProductionRecommendationItem[] = []

    for (const prod of MOCK_PRODUCTS) {
      const inv = await getInventoryStatus(prod.id)
      const demandInfo = demandMap.get(prod.id)
      const orderDemand = demandInfo ? demandInfo.demand : 0

      // INVENTORY CALCULATION RULES:
      // availableStock = max(0, physicalStock - reservedStock)
      // Double-counting prevention:
      // Orders that already reserved stock have their demand met by physical units in reservation.
      // Total physical stock in warehouse = inv.stock (reserved + available).
      // Required new production = max(0, orderDemand - inv.stock).
      // When reservedStock is 0: inv.stock == inv.available, so max(0, orderDemand - inv.available).
      const requiredProduction = Math.max(0, orderDemand - inv.stock)

      const activeProd = activeByProduct.get(prod.id)
      const minStock = (prod as any).minimumStock !== undefined ? (prod as any).minimumStock : 5
      const isCriticalStock = inv.available <= minStock

      let priority: PriorityLevel = 'P3'
      let priorityLabel: PriorityLevelLabel = 'NORMAL'

      if (requiredProduction > 0) {
        priority = 'P0'
        priorityLabel = 'ACİL'
      } else if (isCriticalStock) {
        priority = 'P2'
        priorityLabel = 'KRİTİK STOK'
      }

      // Only recommend products that either have demand, shortage, or low stock
      if (orderDemand > 0 || requiredProduction > 0 || isCriticalStock) {
        const recQty = requiredProduction > 0 ? requiredProduction : Math.max(minStock * 2 - inv.available, minStock)
        const actionUrl = `/admin/production/new?productId=${encodeURIComponent(prod.id)}&quantity=${recQty}&priority=${
          priority === 'P0' ? 'URGENT' : priority === 'P2' ? 'HIGH' : 'NORMAL'
        }`

        recommendations.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          orderDemand,
          physicalStock: inv.stock,
          reservedStock: inv.reserved,
          availableStock: inv.available,
          requiredProduction,
          priority,
          priorityLabel,
          hasActiveProduction: Boolean(activeProd && activeProd.count > 0),
          activeProductionStatus: activeProd ? activeProd.status : null,
          activeProductionQty: activeProd ? activeProd.qty : 0,
          printerReference: (prod as any).printerReference || null,
          actionUrl,
        })
      }
    }

    // Sort deterministically:
    // P0 first, then P2, then P3.
    // Within same priority: requiredProduction DESC, then orderDemand DESC, then productName ASC
    return recommendations.sort((a, b) => {
      const pScore = { P0: 3, P1: 2, P2: 1, P3: 0 }
      if (pScore[a.priority] !== pScore[b.priority]) {
        return pScore[b.priority] - pScore[a.priority]
      }
      if (b.requiredProduction !== a.requiredProduction) {
        return b.requiredProduction - a.requiredProduction
      }
      if (b.orderDemand !== a.orderDemand) {
        return b.orderDemand - a.orderDemand
      }
      return a.productName.localeCompare(b.productName)
    })
  }

  /**
   * Order Blockers Engine
   * Identifies unfulfilled orders that cannot ship due to missing production/stock
   */
  public static async getOrderBlockers(storeId?: string | null): Promise<OrderBlockerItem[]> {
    const openOrders = await this.getOpenOrders(storeId)
    const activeProduction = await getProductionOrders()

    const blockers: OrderBlockerItem[] = []

    for (const ord of openOrders) {
      let isBlocked = false
      let blockerReason = ''
      let highestMissing = 0
      let hasActiveProdForBlocker = false
      let matchedActiveProdOrder: any = null

      const enrichedItems = []

      for (const item of ord.items) {
        const inv = await getInventoryStatus(item.productId)
        // If available stock is less than required quantity and physical stock cannot satisfy
        const missingQty = Math.max(0, item.quantity - inv.available)
        const hasShortage = missingQty > 0

        // Look for active production
        const activeProd = activeProduction.find(
          (p) =>
            p.productId === item.productId &&
            ['IN_PROGRESS', 'QUEUED', 'PLANNED'].includes(p.status)
        )

        if (hasShortage) {
          isBlocked = true
          highestMissing = Math.max(highestMissing, missingQty)

          if (activeProd) {
            hasActiveProdForBlocker = true
            matchedActiveProdOrder = {
              id: activeProd.id,
              status: activeProd.status,
              quantity: activeProd.quantity,
              completedQuantity: activeProd.completedQuantity,
            }
            blockerReason = `Üretim ${activeProd.status === 'IN_PROGRESS' ? 'devam ediyor' : 'kuyrukta'} (${activeProd.status}) — Tamamlanınca gönderilebilir`
          } else {
            blockerReason = `Üretim gerekiyor — ${item.productName} (${missingQty} eksik)`
          }
        }

        enrichedItems.push({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          availableStock: inv.available,
          physicalStock: inv.stock,
          reservedStock: inv.reserved,
          missingQuantity: missingQty,
          hasStockShortage: hasShortage,
        })
      }

      if (isBlocked) {
        const firstMissingItem = enrichedItems.find((i) => i.hasStockShortage)
        const prodId = firstMissingItem ? firstMissingItem.productId : ''
        const actionUrl = hasActiveProdForBlocker
          ? `/admin/production`
          : `/admin/production/new?productId=${encodeURIComponent(prodId)}&quantity=${highestMissing}&orderNumber=${encodeURIComponent(
              ord.orderNumber
            )}&priority=URGENT`

        blockers.push({
          orderId: ord.orderId,
          orderNumber: ord.orderNumber,
          channel: ord.channel,
          storeId: ord.storeId,
          customerName: ord.customerName,
          createdAt: ord.createdAt,
          items: enrichedItems,
          blockerReason,
          hasActiveProduction: hasActiveProdForBlocker,
          activeProductionOrder: matchedActiveProdOrder,
          actionUrl,
          actionLabel: hasActiveProdForBlocker ? 'Üretimi İzle' : 'Üretime Gönder',
          priority: hasActiveProdForBlocker ? 'P1' : 'P0',
        })
      }
    }

    // Deterministic priority and FIFO sorting:
    // P0 (blocking without active production) first, then P1.
    // Within same priority: createdAt ASC (FIFO order)
    return blockers.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === 'P0' ? -1 : 1
      }
      return a.createdAt.localeCompare(b.createdAt)
    })
  }

  /**
   * Retrieves today's shipping operational summary
   */
  public static async getTodayShippingSummary(storeId?: string | null): Promise<TodayShippingSummary> {
    const stats = await BulkShippingService.getDailyShippingStats(storeId)
    const shipments = await ShippingService.listShipments({
      storeId: storeId || undefined,
    })

    const mapped = shipments.slice(0, 15).map((s) => ({
      id: s.id,
      orderNumber: s.orderNumber || s.marketplaceOrderNumber || '—',
      channel: s.channel,
      carrier: s.carrier,
      provider: s.provider,
      trackingNumber: s.trackingNumber,
      status: s.status,
      labelReady: Boolean(s.currentLabelId || s.status === 'LABEL_READY'),
      createdAt: s.createdAt,
    }))

    return {
      stats,
      shipments: mapped,
    }
  }

  /**
   * Retrieves active 3D printing orders
   */
  public static async getActiveProduction(storeId?: string | null): Promise<{
    active: ActiveProductionItem[]
    totalActiveJobs: number
    totalUnitsToProduce: number
  }> {
    const orders = await getProductionOrders()
    const activeOrders = orders.filter((o) =>
      ['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'STOCKED'].includes(o.status)
    )

    let totalUnits = 0
    const mapped: ActiveProductionItem[] = activeOrders.map((o) => {
      const remaining = Math.max(0, o.quantity - o.completedQuantity)
      if (['QUEUED', 'IN_PROGRESS'].includes(o.status)) {
        totalUnits += remaining
      }
      const progressPercent = o.quantity > 0 ? Math.min(100, Math.round((o.completedQuantity / o.quantity) * 100)) : 0
      return {
        id: o.id,
        productId: o.productId,
        productName: o.productNameSnapshot,
        sku: o.skuSnapshot,
        quantity: o.quantity,
        completedQuantity: o.completedQuantity,
        acceptedQuantity: o.acceptedQuantity,
        failedQuantity: o.failedQuantity,
        status: o.status,
        priority: o.priority,
        printerReference: o.printerReference,
        progressPercent,
        createdAt: o.createdAt,
      }
    })

    return {
      active: mapped,
      totalActiveJobs: activeOrders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'QUEUED').length,
      totalUnitsToProduce: totalUnits,
    }
  }

  /**
   * Retrieves low stock products below threshold
   */
  public static async getLowStockSummary(storeId?: string | null): Promise<
    Array<
      LowStockProduct & {
        actionUrl: string
      }
    >
  > {
    const list = await getLowStockProductsForProduction()
    return list.map((item) => ({
      ...item,
      actionUrl: `/admin/production/new?productId=${encodeURIComponent(item.productId)}&quantity=${
        item.suggestedProductionQty
      }&priority=HIGH`,
    }))
  }

  /**
   * Main Orchestration Engine: "BUGÜN"
   * Read-only operational model aggregation with ZERO side-effects / mutations
   */
  public static async getTodayOperations(storeId?: string | null): Promise<TodayOperationsData> {
    const date = this.getTodayDateInfo()

    const [recommendations, blockers, shipping, activeProd, lowStock] = await Promise.all([
      this.getProductionRecommendations(storeId),
      this.getOrderBlockers(storeId),
      this.getTodayShippingSummary(storeId),
      this.getActiveProduction(storeId),
      this.getLowStockSummary(storeId),
    ])

    // Summary KPIs:
    // 1. Kargo: Gönderilecek (kargoyaHazir from daily stats)
    // 2. Üretim: Üretilecek (sum of required production across recommendations)
    // 3. Kritik Stok: Ürün count below minimumStock
    // 4. Bekleyen Sipariş: Hazırlanacak open orders count
    const openOrders = await this.getOpenOrders(storeId)

    const totalRequiredProduction = recommendations.reduce(
      (sum, r) => sum + (r.requiredProduction > 0 ? r.requiredProduction : 0),
      0
    )

    const summary: TodaySummaryKpi = {
      kargoGonderilecek: shipping.stats.kargoyaHazir,
      uretimUretilecek: totalRequiredProduction,
      kritikStokUrun: lowStock.length,
      bekleyenSiparis: openOrders.length,
    }

    // Deterministic Priority Engine: "BUGÜN NE YAPMALIYIM?"
    const priorities: ActionablePriorityItem[] = []
    let rank = 1

    // Priority 1 (P0): Blocked orders needing production
    const urgentBlockers = blockers.filter((b) => b.priority === 'P0')
    if (urgentBlockers.length > 0) {
      const totalShortage = urgentBlockers.reduce(
        (sum, b) => sum + b.items.reduce((iSum, item) => iSum + item.missingQuantity, 0),
        0
      )
      priorities.push({
        id: 'priority-blocking-production',
        level: 'P0',
        levelLabel: 'ACİL',
        badge: '🔴',
        title: `${urgentBlockers.length} siparişin üretimi gerekiyor`,
        description: `${totalShortage} ürün üretilmeden siparişler sevk edilemez`,
        actionLabel: 'Üretime Git',
        actionHref: urgentBlockers[0].actionUrl,
        count: urgentBlockers.length,
        deterministicRank: rank++,
      })
    }

    // Priority 2 (P1): Packages awaiting labels
    if (shipping.stats.etiketBekliyor > 0) {
      priorities.push({
        id: 'priority-labels-pending',
        level: 'P1',
        levelLabel: 'BUGÜN',
        badge: '🟠',
        title: `${shipping.stats.etiketBekliyor} paket etiket bekliyor`,
        description: 'Paketler hazır, kargo barkod ve etiketleri basılmalı',
        actionLabel: 'Kargo Masasına Git',
        actionHref: '/admin/shipping?quickFilter=label_pending',
        count: shipping.stats.etiketBekliyor,
        deterministicRank: rank++,
      })
    }

    // Priority 3 (P1): Ready shipments with labels waiting to be shipped
    if (shipping.stats.etiketHazir > 0 || shipping.stats.kargoyaHazir > 0) {
      const readyCount = shipping.stats.etiketHazir > 0 ? shipping.stats.etiketHazir : shipping.stats.kargoyaHazir
      priorities.push({
        id: 'priority-ready-to-ship',
        level: 'P1',
        levelLabel: 'BUGÜN',
        badge: '🟢',
        title: `${readyCount} paket gönderilmeye hazır`,
        description: 'Kurye veya şubeye teslim edilmek üzere kargo hazır',
        actionLabel: 'Kargoya Git',
        actionHref: '/admin/shipping?quickFilter=ready',
        count: readyCount,
        deterministicRank: rank++,
      })
    }

    // Priority 4 (P2): Critical low stock
    if (lowStock.length > 0) {
      priorities.push({
        id: 'priority-critical-stock',
        level: 'P2',
        levelLabel: 'KRİTİK STOK',
        badge: '🟡',
        title: `${lowStock.length} ürün kritik stok seviyesinde`,
        description: 'Güvenlik stok eşiğinin altına düşmüş ürünler',
        actionLabel: 'Stokları Gör',
        actionHref: '/admin/inventory',
        count: lowStock.length,
        deterministicRank: rank++,
      })
    }

    // Priority 5 (P3): Active production jobs in progress
    if (activeProd.totalActiveJobs > 0) {
      priorities.push({
        id: 'priority-active-production',
        level: 'P3',
        levelLabel: 'NORMAL',
        badge: '🔵',
        title: `${activeProd.totalActiveJobs} aktif üretim işi devam ediyor`,
        description: `${activeProd.totalUnitsToProduce} adet ürün baskı kuyruğunda`,
        actionLabel: 'Üretimi Gör',
        actionHref: '/admin/production',
        count: activeProd.totalActiveJobs,
        deterministicRank: rank++,
      })
    }

    const materials = await MaterialService.getMaterialReadiness(storeId)

    return {
      date,
      summary,
      priorities,
      production: {
        recommendations,
        active: activeProd.active,
        totalActiveJobs: activeProd.totalActiveJobs,
        totalUnitsToProduce: activeProd.totalUnitsToProduce,
      },
      shipping,
      blockers,
      lowStock,
      materials,
    }
  }
}

// Standalone function exports for convenient importing
export const getTodayOperations = DailyOperationsService.getTodayOperations.bind(DailyOperationsService)
export const getProductionRecommendations =
  DailyOperationsService.getProductionRecommendations.bind(DailyOperationsService)
export const getOrderBlockers = DailyOperationsService.getOrderBlockers.bind(DailyOperationsService)
export const getTodayShippingSummary =
  DailyOperationsService.getTodayShippingSummary.bind(DailyOperationsService)
export const getLowStockSummary = DailyOperationsService.getLowStockSummary.bind(DailyOperationsService)
export const getTodayDateInfo = DailyOperationsService.getTodayDateInfo.bind(DailyOperationsService)
