import 'server-only'
import { db } from '@/prisma/db'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { getAllOrders, type StoredOrder } from './orders.service'
import { getProductionSummary, getLowStockProductsForProduction } from './production.service'

export interface AuditLogEntry {
  id: string
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

/**
 * Records an audit log entry for admin and system events. Never throws: auditing
 * must not break the action being audited, but a failure is logged loudly.
 */
export async function logAuditEvent(entry: {
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<AuditLogEntry> {
  const base = {
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId || null,
    metadata: { ...(entry.metadata ?? {}), ...(entry.userId ? { actorUserId: entry.userId } : {}) } as never,
  }

  let row: { id: string; createdAt: unknown } | null = null
  try {
    // userId is a foreign key to users; system actors ("admin", "system") are not users.
    row = await db.orm.public.AuditLog.create({ ...base, userId: entry.userId || null })
  } catch {
    try {
      row = await db.orm.public.AuditLog.create(base)
    } catch (err) {
      console.error('[admin.service] Audit log write failed:', entry.action, err)
    }
  }

  return {
    id: row?.id ?? `unsaved-${Date.now()}`,
    userId: entry.userId || null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId || null,
    metadata: entry.metadata || null,
    createdAt: dbTimestampToIso(row?.createdAt) ?? new Date().toISOString(),
  }
}

/**
 * Retrieves recent audit logs
 */
export async function getAuditLogs(limit = 50, filters?: { action?: string; entity?: string }): Promise<AuditLogEntry[]> {
  let query = db.orm.public.AuditLog.orderBy((l) => l.createdAt.desc()).limit(Math.min(limit, 500))
  if (filters?.action) query = query.where({ action: filters.action })
  if (filters?.entity) query = query.where({ entity: filters.entity })
  const rows = await query.all()
  return rows.map((r) => {
    const metadata = (r.metadata ?? null) as Record<string, unknown> | null
    return {
      id: r.id,
      userId: r.userId ?? (metadata?.actorUserId as string | undefined) ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? null,
      metadata,
      createdAt: dbTimestampToIso(r.createdAt) ?? '',
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

const PAID = new Set(['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED'])
const TZ = 'Europe/Istanbul'
const DAY_MS = 24 * 3600 * 1000

/** Calendar parts in Istanbul time, so "today" and month buckets match the business day. */
function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), key: `${parts.year}-${parts.month}-${parts.day}` }
}

const TR_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function revenueOf(orders: StoredOrder[]) {
  return Math.round(orders.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100
}

/** Paid orders bucketed for the revenue charts (7 days, 4 weeks, 3 months, 12 months). */
function buildCharts(paid: Array<StoredOrder & { at: Date }>, now: Date) {
  const series = (buckets: Array<{ label: string; match: (d: Date) => boolean }>) =>
    buckets.map((b) => {
      const inBucket = paid.filter((o) => b.match(o.at))
      return { label: b.label, revenue: revenueOf(inBucket), orders: inBucket.length }
    })

  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() - (6 - i) * DAY_MS))
  const chart7d = series(days.map((d) => {
    const key = localParts(d).key
    return { label: TR_DAYS[new Date(`${key}T12:00:00Z`).getUTCDay()], match: (x: Date) => localParts(x).key === key }
  }))

  const chart30d = series(Array.from({ length: 4 }, (_, i) => {
    const end = now.getTime() - (3 - i) * 7 * DAY_MS
    const start = end - 7 * DAY_MS
    return { label: `${i + 1}. Hafta`, match: (x: Date) => x.getTime() > start && x.getTime() <= end }
  }))

  const monthBuckets = (count: number) => {
    const { y, m } = localParts(now)
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i
      const month = ((m - 1 - offset) % 12 + 12) % 12
      const year = y - Math.ceil(Math.max(0, offset - (m - 1)) / 12)
      return {
        label: TR_MONTHS[month],
        match: (x: Date) => {
          const p = localParts(x)
          return p.y === year && p.m === month + 1
        },
      }
    })
  }

  return { '7d': chart7d, '30d': chart30d, '90d': series(monthBuckets(3)), '12m': series(monthBuckets(12)) }
}

/**
 * Admin dashboard metrics, all computed from the database. Revenue counts paid
 * orders only (by payment date), in Istanbul time.
 */
export async function getAdminOverview() {
  const now = new Date()
  const today = localParts(now).key
  const { y, m } = localParts(now)
  const monthStart = new Date(Date.UTC(y, m - 1, 1) - 3 * 3600 * 1000) // 00:00 Istanbul (UTC+3)
  const prevMonthStart = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1) - 3 * 3600 * 1000)

  const [
    allOrders,
    products,
    collectionsCount,
    customers,
    customersThisMonth,
    openTickets,
    pendingReviews,
    activeCoupons,
    productionSummary,
    lowStockItems,
  ] = await Promise.all([
    getAllOrders({ limit: 2000 }),
    db.orm.public.Product.select('id', 'isActive', 'stock', 'lowStockThreshold').all(),
    db.orm.public.Collection.where({ status: 'ACTIVE' }).aggregate((a) => ({ n: a.count() })),
    db.orm.public.User.where({ role: 'CUSTOMER' }).aggregate((a) => ({ n: a.count() })),
    db.orm.public.User.where({ role: 'CUSTOMER' })
      .where((u) => u.createdAt.gte(toDbTimestamp(monthStart) as never))
      .aggregate((a) => ({ n: a.count() })),
    db.orm.public.SupportTicket.where((t) => t.status.in(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] as never[]))
      .aggregate((a) => ({ n: a.count() })),
    db.orm.public.Review.where({ status: 'PENDING' }).aggregate((a) => ({ n: a.count() })),
    db.orm.public.Coupon.where({ isActive: true }).aggregate((a) => ({ n: a.count() })),
    getProductionSummary(),
    getLowStockProductsForProduction(),
  ])

  const paid = allOrders
    .filter((o) => PAID.has(o.status))
    .map((o) => ({ ...o, at: new Date(o.paidAt ?? o.createdAt) }))
  const sevenDaysAgo = now.getTime() - 7 * DAY_MS

  const count = (statuses: string[]) => allOrders.filter((o) => statuses.includes(o.status)).length
  const orderCounts = {
    total: allOrders.length,
    newOrders: count(['CONFIRMED', 'PAYMENT_RECEIVED']),
    processing: count(['PREPARING', 'IN_PRODUCTION']),
    awaitingShipment: count(['PACKING']),
    shipped: count(['SHIPPED']),
    delivered: count(['DELIVERED']),
    cancelled: count(['CANCELLED']),
  }

  const activeProducts = products.filter((p) => p.isActive)
  const lowStockCount = activeProducts.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)).length
  const outOfStockCount = activeProducts.filter((p) => p.stock <= 0).length

  // Repeat rate: share of paying customers with more than one paid order.
  const paidPerUser = new Map<string, number>()
  for (const o of paid) paidPerUser.set(o.userId, (paidPerUser.get(o.userId) ?? 0) + 1)
  const payingCustomers = paidPerUser.size
  const repeatCustomers = [...paidPerUser.values()].filter((n) => n > 1).length

  const directOrders = allOrders.filter((o) => (o.channel || 'DIRECT') === 'DIRECT').length
  const liveSync = (key: string) => process.env[key] === '1' || process.env[key] === 'true'

  return {
    sales: {
      todayRevenue: revenueOf(paid.filter((o) => localParts(o.at).key === today)),
      weekRevenue: revenueOf(paid.filter((o) => o.at.getTime() >= sevenDaysAgo)),
      monthRevenue: revenueOf(paid.filter((o) => o.at >= monthStart)),
      previousMonthRevenue: revenueOf(paid.filter((o) => o.at >= prevMonthStart && o.at < monthStart)),
    },
    orders: orderCounts,
    ordersByChannel: {
      direct: directOrders,
      // Marketplace orders are not stored in the order table yet.
      trendyol: 0,
      hepsiburada: 0,
    },
    actionSummary: {
      newOrders: orderCounts.newOrders,
      toPrepare: orderCounts.processing,
      toShip: orderCounts.awaitingShipment,
      criticalStock: lowStockCount + outOfStockCount,
      activePrinting: productionSummary?.active || 0,
      queuedPrinting: productionSummary?.queued || 0,
      completedAwaitingStock: productionSummary?.completed || 0,
    },
    channelHealth: [
      { name: 'ZUULAB Direct', provider: 'DIRECT', status: 'ONLINE', orderCount: directOrders, lastSync: now.toISOString() },
      { name: 'Trendyol', provider: 'TRENDYOL', status: liveSync('TRENDYOL_LIVE_SYNC') ? 'ONLINE' : 'OFFLINE', orderCount: 0, lastSync: null },
      { name: 'Hepsiburada', provider: 'HEPSIBURADA', status: liveSync('HEPSIBURADA_LIVE_SYNC') ? 'ONLINE' : 'OFFLINE', orderCount: 0, lastSync: null },
    ],
    products: {
      totalProducts: products.length,
      activeProducts: activeProducts.length,
      lowStockCount,
      outOfStockCount,
      totalCollections: collectionsCount.n,
    },
    customers: {
      totalCustomers: customers.n,
      newCustomersThisMonth: customersThisMonth.n,
      repeatCustomerRate: payingCustomers > 0 ? Math.round((repeatCustomers / payingCustomers) * 100) : 0,
    },
    operations: {
      openTickets: openTickets.n,
      pendingReviews: pendingReviews.n,
      activeCoupons: activeCoupons.n,
    },
    production: productionSummary,
    lowStock: lowStockItems.slice(0, 10),
    charts: buildCharts(paid, now),
  }
}
