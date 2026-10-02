import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso } from '@/lib/db/time'
import { logAuditEvent } from './admin.service'
import type { AuthUser } from './auth.service'

/**
 * Filament (and other print material) stock, in grams.
 *
 * Every change is one locked transaction that writes a movement row; production
 * consumption carries an idempotency key, so a job can never deduct twice. Stock may
 * go below zero when more was used than recorded — that is shown, not hidden.
 * "Reserved" grams are what open print jobs (planned/queued/printing) will still use.
 */

export type MaterialMovementType = 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'PRODUCTION_CONSUMPTION' | 'WASTE' | 'RETURN'
export type MaterialStatus = 'OK' | 'LOW' | 'OUT'

export interface MaterialStockItem {
  id: string
  materialName: string
  color: string | null
  quantityGrams: number
  minimumQuantityGrams: number
  location: string | null
  isActive: boolean
  pricePerKgTl: number | null
  totalValueTl: number | null
  /** Grams open print jobs still need */
  reservedGrams: number
  /** quantity − reserved */
  freeGrams: number
  status: MaterialStatus
  createdAt: string
  updatedAt: string
}

export interface MaterialStockMovementItem {
  id: string
  materialStockId: string
  type: MaterialMovementType
  quantityGrams: number
  previousQuantityGrams: number
  newQuantityGrams: number
  reason: string
  reference: string | null
  createdBy: string
  createdAt: string
}

export interface CreateMaterialStockInput {
  materialName: string
  color?: string | null
  quantityGrams?: number
  minimumQuantityGrams?: number
  location?: string | null
  pricePerKgTl?: number | null
}

export interface UpdateMaterialStockInput {
  materialName?: string
  color?: string | null
  minimumQuantityGrams?: number
  location?: string | null
  isActive?: boolean
  pricePerKgTl?: number | null
}

export interface AdjustMaterialStockInput {
  deltaGrams: number
  type?: MaterialMovementType
  reason: string
  reference?: string | null
  idempotencyKey?: string
}

export interface MaterialReadinessSummary {
  totalMaterialGrams: number
  totalMaterialValueTl: number
  lowCount: number
  outCount: number
  materials: MaterialStockItem[]
  /** Open print jobs whose filament will not be enough */
  shortJobs: Array<{ productionOrderId: string; productName: string; materialName: string; color: string | null; missingGrams: number }>
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const MOVEMENT_TYPES: MaterialMovementType[] = ['PURCHASE', 'MANUAL_ADJUSTMENT', 'PRODUCTION_CONSUMPTION', 'WASTE', 'RETURN']
const OPEN_JOB_STATUSES = ['PLANNED', 'QUEUED', 'IN_PROGRESS']

function grams(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100
}

function actor(user: Pick<AuthUser, 'id' | 'email'> | string): string {
  return typeof user === 'string' ? user : user.email || user.id
}

/** Grams that open print jobs will still use, per material stock. */
async function reservedByMaterial(): Promise<Map<string, number>> {
  const jobs = await db.orm.public.ProductionOrder.where((o) => o.status.in(OPEN_JOB_STATUSES as never))
    .select('materialStockId', 'quantity', 'gramsPerUnit')
    .all()
  const map = new Map<string, number>()
  for (const j of jobs) {
    if (!j.materialStockId || j.gramsPerUnit === null) continue
    map.set(j.materialStockId, (map.get(j.materialStockId) ?? 0) + j.quantity * grams(j.gramsPerUnit))
  }
  return map
}

type StockRow = {
  id: string
  materialName: string
  color: string | null
  quantityGrams: unknown
  minimumQuantityGrams: unknown
  pricePerKgTl: unknown
  location: string | null
  isActive: boolean
  createdAt: unknown
  updatedAt: unknown
}

function toItem(row: StockRow, reserved: number): MaterialStockItem {
  const quantity = grams(row.quantityGrams)
  const minimum = grams(row.minimumQuantityGrams)
  const price = row.pricePerKgTl === null || row.pricePerKgTl === undefined ? null : grams(row.pricePerKgTl)
  const free = Math.round((quantity - reserved) * 100) / 100
  return {
    id: row.id,
    materialName: row.materialName,
    color: row.color,
    quantityGrams: quantity,
    minimumQuantityGrams: minimum,
    location: row.location,
    isActive: row.isActive,
    pricePerKgTl: price,
    totalValueTl: price === null ? null : Math.round((Math.max(0, quantity) / 1000) * price * 100) / 100,
    reservedGrams: Math.round(reserved * 100) / 100,
    freeGrams: free,
    status: quantity <= 0 ? 'OUT' : free < minimum ? 'LOW' : 'OK',
    createdAt: dbTimestampToIso(row.createdAt) ?? '',
    updatedAt: dbTimestampToIso(row.updatedAt) ?? '',
  }
}

/**
 * Changes a material's grams inside a transaction and writes the movement.
 * Returns null when `idempotencyKey` was already applied.
 */
export async function applyMaterialMovement(
  tx: Tx,
  params: {
    materialStockId: string
    deltaGrams: number
    type: MaterialMovementType
    reason: string
    reference?: string | null
    idempotencyKey?: string | null
    createdBy: string
  }
): Promise<{ previous: number; next: number } | null> {
  if (params.idempotencyKey) {
    const seen = await tx.orm.public.MaterialStockMovement.where({ idempotencyKey: params.idempotencyKey }).first()
    if (seen) return null
  }
  const [row] = (await tx.query(
    db.raw.sql`SELECT quantity_grams::float8 AS q FROM material_stocks WHERE id = ${params.materialStockId} FOR UPDATE`
      .returnsRow({ q: 'pg/float8@1' } as never)
      .build()
  )) as unknown as Array<{ q: number }>
  if (!row) throw new Error('Malzeme bulunamadı.')
  const previous = grams(row.q)
  const next = Math.round((previous + params.deltaGrams) * 100) / 100
  await tx.orm.public.MaterialStock.where({ id: params.materialStockId }).update({ quantityGrams: dbNumeric(next) } as never)
  await tx.orm.public.MaterialStockMovement.create({
    materialStockId: params.materialStockId,
    type: params.type,
    quantityGrams: dbNumeric(params.deltaGrams),
    previousQuantityGrams: dbNumeric(previous),
    newQuantityGrams: dbNumeric(next),
    reason: params.reason,
    reference: params.reference ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
    createdBy: params.createdBy,
  } as never)
  return { previous, next }
}

export class MaterialService {
  public static async getMaterialStocks(_storeId?: string | null): Promise<MaterialStockItem[]> {
    const [rows, reserved] = await Promise.all([db.orm.public.MaterialStock.all(), reservedByMaterial()])
    return (rows as StockRow[])
      .map((r) => toItem(r, reserved.get(r.id) ?? 0))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.materialName.localeCompare(b.materialName, 'tr') || (a.color ?? '').localeCompare(b.color ?? '', 'tr'))
  }

  public static async getMaterialStockById(id: string, _storeId?: string | null): Promise<MaterialStockItem | null> {
    const row = (await db.orm.public.MaterialStock.where({ id }).first()) as StockRow | null
    if (!row) return null
    return toItem(row, (await reservedByMaterial()).get(id) ?? 0)
  }

  public static async createMaterialStock(
    input: CreateMaterialStockInput,
    user: Pick<AuthUser, 'id' | 'email'>
  ): Promise<{ success: boolean; stock?: MaterialStockItem; error?: string }> {
    const materialName = input.materialName?.trim()
    if (!materialName) return { success: false, error: 'Malzeme adı zorunludur (ör. PLA).' }
    const color = input.color?.trim() || null
    const quantity = Number(input.quantityGrams ?? 0)
    const minimum = Number(input.minimumQuantityGrams ?? 1000)
    const price = input.pricePerKgTl === undefined || input.pricePerKgTl === null || input.pricePerKgTl === ('' as never) ? null : Number(input.pricePerKgTl)
    if (!Number.isFinite(quantity) || quantity < 0) return { success: false, error: 'Başlangıç miktarı 0 veya pozitif olmalıdır.' }
    if (!Number.isFinite(minimum) || minimum < 0) return { success: false, error: 'Minimum miktar 0 veya pozitif olmalıdır.' }
    if (price !== null && (!Number.isFinite(price) || price < 0)) return { success: false, error: 'Kilo fiyatı geçerli bir tutar olmalıdır.' }

    const duplicate = (await db.orm.public.MaterialStock.where({ materialName }).all()).find(
      (m) => (m.color ?? '').toLocaleLowerCase('tr-TR') === (color ?? '').toLocaleLowerCase('tr-TR')
    )
    if (duplicate) return { success: false, error: `${materialName}${color ? ` ${color}` : ''} zaten kayıtlı.` }

    const id = await db.transaction(async (tx) => {
      const created = await tx.orm.public.MaterialStock.create({
        materialName,
        color,
        quantityGrams: dbNumeric(0),
        minimumQuantityGrams: dbNumeric(minimum),
        pricePerKgTl: price === null ? null : dbNumeric(price),
        location: input.location?.trim() || null,
        isActive: true,
      } as never)
      const stockId = (created as { id: string }).id
      if (quantity > 0) {
        await applyMaterialMovement(tx, {
          materialStockId: stockId,
          deltaGrams: quantity,
          type: 'PURCHASE',
          reason: 'Başlangıç stoku',
          createdBy: actor(user),
        })
      }
      return stockId
    })

    await logAuditEvent({ userId: user.id, action: 'MATERIAL_CREATED', entity: 'MaterialStock', entityId: id, metadata: { materialName, color, quantity } })
    return { success: true, stock: (await this.getMaterialStockById(id))! }
  }

  public static async updateMaterialStock(
    id: string,
    input: UpdateMaterialStockInput,
    user: Pick<AuthUser, 'id' | 'email'>
  ): Promise<{ success: boolean; stock?: MaterialStockItem; error?: string }> {
    const existing = await db.orm.public.MaterialStock.where({ id }).first()
    if (!existing) return { success: false, error: 'Malzeme bulunamadı.' }
    const changes: Record<string, unknown> = {}
    if (input.materialName !== undefined) {
      if (!input.materialName.trim()) return { success: false, error: 'Malzeme adı boş olamaz.' }
      changes.materialName = input.materialName.trim()
    }
    if (input.color !== undefined) changes.color = input.color?.trim() || null
    if (input.location !== undefined) changes.location = input.location?.trim() || null
    if (input.isActive !== undefined) changes.isActive = Boolean(input.isActive)
    if (input.minimumQuantityGrams !== undefined) {
      const min = Number(input.minimumQuantityGrams)
      if (!Number.isFinite(min) || min < 0) return { success: false, error: 'Minimum miktar 0 veya pozitif olmalıdır.' }
      changes.minimumQuantityGrams = dbNumeric(min)
    }
    if (input.pricePerKgTl !== undefined) {
      const price = input.pricePerKgTl === null || input.pricePerKgTl === ('' as never) ? null : Number(input.pricePerKgTl)
      if (price !== null && (!Number.isFinite(price) || price < 0)) return { success: false, error: 'Kilo fiyatı geçerli bir tutar olmalıdır.' }
      changes.pricePerKgTl = price === null ? null : dbNumeric(price)
    }
    if (Object.keys(changes).length) await db.orm.public.MaterialStock.where({ id }).update(changes as never)
    await logAuditEvent({ userId: user.id, action: 'MATERIAL_UPDATED', entity: 'MaterialStock', entityId: id, metadata: { changed: Object.keys(changes) } })
    return { success: true, stock: (await this.getMaterialStockById(id))! }
  }

  public static async adjustMaterialStock(
    id: string,
    input: AdjustMaterialStockInput,
    user: Pick<AuthUser, 'id' | 'email'>
  ): Promise<{ success: boolean; stock?: MaterialStockItem; idempotent?: boolean; error?: string }> {
    const delta = Number(input.deltaGrams)
    if (!Number.isFinite(delta) || delta === 0) return { success: false, error: 'Değişim miktarı sıfırdan farklı bir sayı olmalıdır.' }
    if (!input.reason?.trim()) return { success: false, error: 'Açıklama zorunludur.' }
    const type = MOVEMENT_TYPES.includes(input.type as MaterialMovementType)
      ? (input.type as MaterialMovementType)
      : delta > 0
        ? 'PURCHASE'
        : 'MANUAL_ADJUSTMENT'
    if (type === 'PRODUCTION_CONSUMPTION') return { success: false, error: 'Üretim tüketimi yalnızca üretim emirlerinden yapılır.' }
    if (!(await db.orm.public.MaterialStock.where({ id }).first())) return { success: false, error: 'Malzeme bulunamadı.' }

    const applied = await db.transaction((tx) =>
      applyMaterialMovement(tx, {
        materialStockId: id,
        deltaGrams: delta,
        type,
        reason: input.reason.trim(),
        reference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdBy: actor(user),
      })
    )
    if (applied) {
      await logAuditEvent({ userId: user.id, action: 'MATERIAL_ADJUSTED', entity: 'MaterialStock', entityId: id, metadata: { delta, type, reason: input.reason } })
    }
    return { success: true, stock: (await this.getMaterialStockById(id))!, idempotent: applied === null }
  }

  public static async getMaterialMovements(id: string, _storeId?: string | null): Promise<MaterialStockMovementItem[]> {
    const rows = await db.orm.public.MaterialStockMovement.where({ materialStockId: id })
      .orderBy((m) => m.createdAt.desc())
      .limit(200)
      .all()
    return rows.map((m) => ({
      id: m.id,
      materialStockId: m.materialStockId,
      type: m.type as MaterialMovementType,
      quantityGrams: grams(m.quantityGrams),
      previousQuantityGrams: grams(m.previousQuantityGrams),
      newQuantityGrams: grams(m.newQuantityGrams),
      reason: m.reason,
      reference: m.reference,
      createdBy: m.createdBy,
      createdAt: dbTimestampToIso(m.createdAt) ?? '',
    }))
  }

  /** Material overview for dashboards: low/empty filaments and open jobs that will run short. */
  public static async getMaterialReadiness(_storeId?: string | null): Promise<MaterialReadinessSummary> {
    const materials = await this.getMaterialStocks()
    const active = materials.filter((m) => m.isActive)
    const byId = new Map(materials.map((m) => [m.id, m]))

    // Walk open jobs oldest first; each takes from what is left of its filament.
    const jobs = await db.orm.public.ProductionOrder.where((o) => o.status.in(OPEN_JOB_STATUSES as never))
      .orderBy((o) => o.createdAt.asc())
      .all()
    const left = new Map(materials.map((m) => [m.id, m.quantityGrams]))
    const shortJobs: MaterialReadinessSummary['shortJobs'] = []
    for (const j of jobs) {
      if (!j.materialStockId || j.gramsPerUnit === null) continue
      const need = j.quantity * grams(j.gramsPerUnit)
      const available = left.get(j.materialStockId) ?? 0
      left.set(j.materialStockId, available - need)
      if (available < need) {
        const m = byId.get(j.materialStockId)
        shortJobs.push({
          productionOrderId: j.id,
          productName: j.productNameSnapshot,
          materialName: m?.materialName ?? '—',
          color: m?.color ?? null,
          missingGrams: Math.round((need - Math.max(0, available)) * 100) / 100,
        })
      }
    }

    return {
      totalMaterialGrams: Math.round(active.reduce((s, m) => s + Math.max(0, m.quantityGrams), 0) * 100) / 100,
      totalMaterialValueTl: Math.round(active.reduce((s, m) => s + (m.totalValueTl ?? 0), 0) * 100) / 100,
      lowCount: active.filter((m) => m.status === 'LOW').length,
      outCount: active.filter((m) => m.status === 'OUT').length,
      materials: active,
      shortJobs,
    }
  }
}
