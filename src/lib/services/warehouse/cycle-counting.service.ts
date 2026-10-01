import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { adjustInventory, getInventoryStatus, initializeProductInventory } from '@/lib/services/inventory.service'
import { LocationService } from './location.service'
import { WarehouseScanService } from './warehouse-scan.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from './warehouse-error'
import type {
  WarehouseCountSessionRecord,
  WarehouseCountLineRecord,
  WarehouseReconciliationTicketRecord,
  WarehouseCountType,
  WarehouseCountSessionStatus,
  WarehouseCountLineStatus,
  WarehouseReconciliationStatus,
  CreateCountSessionInput,
  SubmitCountScanInput,
} from './warehouse-types'

// In-memory cycle counting stores
const inMemorySessions: Map<string, WarehouseCountSessionRecord> = new Map()
const inMemoryLines: Map<string, WarehouseCountLineRecord> = new Map()
const inMemoryTickets: Map<string, WarehouseReconciliationTicketRecord> = new Map()
const inMemoryIdempotencyKeys: Set<string> = new Set()

// Mutex queues per session / line
const countLocks: Map<string, Promise<unknown>> = new Map()

async function acquireCountMutex<T>(key: string, task: () => Promise<T>): Promise<T> {
  const current = countLocks.get(key) || Promise.resolve()
  let release: () => void
  const next = new Promise<void>((res) => {
    release = res
  })
  countLocks.set(key, current.then(() => next))

  try {
    await current
    return await task()
  } finally {
    release!()
    if (countLocks.get(key) === next) {
      countLocks.delete(key)
    }
  }
}

export class CycleCountingService {
  /**
   * Clears state for tests
   */
  public static resetState(): void {
    inMemorySessions.clear()
    inMemoryLines.clear()
    inMemoryTickets.clear()
    inMemoryIdempotencyKeys.clear()
    countLocks.clear()
  }

  /**
   * Creates a new warehouse count session with lines populated from target locations / SKUs
   */
  public static async createSession(input: CreateCountSessionInput): Promise<WarehouseCountSessionRecord> {
    const warehouseId = input.warehouseId || 'MAIN'
    const idempotencyKey =
      input.idempotencyKey ||
      `COUNT_SESSION:${warehouseId}:${input.type || 'LOCATION'}:${Date.now()}:${Math.floor(Math.random() * 1000)}`

    if (inMemoryIdempotencyKeys.has(idempotencyKey)) {
      const existing = Array.from(inMemorySessions.values()).find(
        (s) => s.idempotencyKey === idempotencyKey
      )
      if (existing) return existing
    }

    const sessionId = `count_sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const countNumber = `CNT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`
    const now = new Date().toISOString()

    const session: WarehouseCountSessionRecord = {
      id: sessionId,
      storeId: input.storeId || null,
      warehouseId,
      countNumber,
      type: input.type || 'LOCATION',
      status: input.assignedTo ? 'ASSIGNED' : 'DRAFT',
      blindMode: input.blindMode !== undefined ? input.blindMode : true,
      createdBy: input.createdBy,
      assignedTo: input.assignedTo || null,
      startedAt: null,
      completedAt: null,
      approvedAt: null,
      idempotencyKey,
      notes: input.notes || null,
      createdAt: now,
      updatedAt: now,
      lines: [],
      tickets: [],
    }

    inMemorySessions.set(sessionId, session)
    inMemoryIdempotencyKeys.add(idempotencyKey)

    // Populate count lines based on locations / products
    const targetLocations = input.locationIds && input.locationIds.length > 0
      ? await Promise.all(input.locationIds.map((id) => LocationService.getLocation(id)))
      : (await LocationService.listLocations({ warehouseId })).filter((l) => l.type === 'BIN' && l.isActive)

    for (const loc of targetLocations) {
      if (!loc) continue

      const inventories = await LocationService.getLocationInventory(loc.id)

      if (inventories.length > 0) {
        for (const inv of inventories) {
          if (input.productIds && input.productIds.length > 0 && !input.productIds.includes(inv.productId)) {
            continue
          }

          const lineId = `count_line_${sessionId}_${loc.id}_${inv.productId}`
          const line: WarehouseCountLineRecord = {
            id: lineId,
            sessionId,
            locationId: loc.id,
            locationCode: loc.code,
            productId: inv.productId,
            sku: inv.sku,
            barcode: null,
            productName: inv.sku,
            expectedQuantity: inv.quantity,
            countedQuantity: null,
            varianceQuantity: null,
            status: 'PENDING',
            countedAt: null,
            countedBy: null,
            recountCount: 0,
            countHistory: [],
            notes: null,
            createdAt: now,
            updatedAt: now,
          }

          inMemoryLines.set(lineId, line)
          session.lines!.push(line)

          // Seed central inventory for this product if never tracked
          // This ensures adjustInventory during reconciliation has a non-zero baseline
          await initializeProductInventory(inv.productId, inv.sku, inv.quantity).catch(() => {})
        }
      } else if (input.type === 'LOCATION' || input.type === 'SPOT_CHECK') {
        // Empty bin target line placeholder
        const lineId = `count_line_${sessionId}_${loc.id}_empty`
        const line: WarehouseCountLineRecord = {
          id: lineId,
          sessionId,
          locationId: loc.id,
          locationCode: loc.code,
          productId: 'NONE',
          sku: 'EMPTY_BIN',
          barcode: null,
          productName: `Boş Lokasyon (${loc.code})`,
          expectedQuantity: 0,
          countedQuantity: null,
          varianceQuantity: null,
          status: 'PENDING',
          countedAt: null,
          countedBy: null,
          recountCount: 0,
          countHistory: [],
          notes: null,
          createdAt: now,
          updatedAt: now,
        }
        inMemoryLines.set(lineId, line)
        session.lines!.push(line)
      }
    }

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseCountSession as any).create({
          data: {
            id: session.id,
            storeId: session.storeId,
            warehouseId: session.warehouseId,
            countNumber: session.countNumber,
            type: session.type,
            status: session.status,
            blindMode: session.blindMode,
            createdBy: session.createdBy,
            assignedTo: session.assignedTo,
            idempotencyKey: session.idempotencyKey,
            notes: session.notes,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        })
      } catch (err) {
        console.warn('[CycleCountingService] DB session save fallback to memory:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.count.created',
      entity: 'WarehouseCountSession',
      entityId: sessionId,
      userId: input.createdBy,
      metadata: {
        countNumber,
        type: session.type,
        lineCount: session.lines?.length || 0,
        blindMode: session.blindMode,
        storeId: session.storeId,
      },
    })

    return session
  }

  /**
   * Starts a count session, transitioning from DRAFT / ASSIGNED to IN_PROGRESS
   */
  public static async startSession(
    sessionId: string,
    operatorId: string
  ): Promise<WarehouseCountSessionRecord> {
    return acquireCountMutex(sessionId, async () => {
      const session = inMemorySessions.get(sessionId)
      if (!session) {
        throw new WarehouseNotFoundError(`Sayım oturumu bulunamadı (ID: ${sessionId}).`)
      }

      if (session.status === 'IN_PROGRESS') {
        return session
      }

      if (session.status !== 'DRAFT' && session.status !== 'ASSIGNED') {
        throw new WarehouseInvalidStateError(
          `Sayım oturumu başlatılamaz. Mevcut durum: ${session.status} (Beklenen: DRAFT veya ASSIGNED).`
        )
      }

      const now = new Date().toISOString()
      session.status = 'IN_PROGRESS'
      session.startedAt = now
      if (!session.assignedTo) {
        session.assignedTo = operatorId
      }
      session.updatedAt = now

      if (isDatabaseConfigured) {
        try {
          await (db.orm.public.WarehouseCountSession as any).where({ id: sessionId }).update({
            status: 'IN_PROGRESS',
            startedAt: new Date(now),
            assignedTo: session.assignedTo,
            updatedAt: new Date(now),
          })
        } catch (err) {
          console.warn('[CycleCountingService] DB update failed:', err)
        }
      }

      await logAuditEvent({
        action: 'warehouse.count.started',
        entity: 'WarehouseCountSession',
        entityId: sessionId,
        userId: operatorId,
        metadata: { countNumber: session.countNumber },
      })

      return session
    })
  }

  /**
   * Submits a physical count scan for a location and product.
   * Calculates variance and creates reconciliation tickets if discrepancy detected.
   */
  public static async submitCountScan(input: SubmitCountScanInput): Promise<{
    session: WarehouseCountSessionRecord
    line: WarehouseCountLineRecord
    ticket?: WarehouseReconciliationTicketRecord
    idempotent?: boolean
  }> {
    const session = inMemorySessions.get(input.sessionId)
    if (!session) {
      throw new WarehouseNotFoundError(`Sayım oturumu bulunamadı (ID: ${input.sessionId}).`)
    }

    // Resolve product identity early for idempotency key construction
    // We need to check idempotency BEFORE session state to honour already-committed scans
    // even if the session has since transitioned to RECONCILED / COUNTED.
    let resolvedProductEarly: Awaited<ReturnType<typeof WarehouseScanService.resolveProductIdentity>> | null = null
    let targetLocationEarly: Awaited<ReturnType<typeof LocationService.getLocation>> | null = null
    try {
      if (input.locationId) {
        targetLocationEarly = await LocationService.getLocation(input.locationId)
      } else if (input.locationCode) {
        targetLocationEarly = await LocationService.getLocationByCode(input.locationCode)
      }
      if (targetLocationEarly) {
        resolvedProductEarly = await WarehouseScanService.resolveProductIdentity(input.barcodeOrSku)
      }
    } catch {
      // If we cannot resolve, we'll fail below in the normal flow
    }

    if (resolvedProductEarly && targetLocationEarly) {
      const attemptEarly = input.idempotencyAttempt || 1
      const lineKeyEarly = `${session.id}:${targetLocationEarly.id}:${resolvedProductEarly.productId}`
      const earlyIdempotencyKey = `COUNT:${session.id}:${lineKeyEarly}:${attemptEarly}`
      if (inMemoryIdempotencyKeys.has(earlyIdempotencyKey)) {
        const existingLine = Array.from(inMemoryLines.values()).find(
          (l) =>
            l.sessionId === session.id &&
            l.locationId === targetLocationEarly!.id &&
            l.productId === resolvedProductEarly!.productId
        )
        if (existingLine) {
          return { session, line: existingLine, idempotent: true }
        }
      }
    }

    if (session.status !== 'IN_PROGRESS' && session.status !== 'RECOUNT_REQUIRED') {
      throw new WarehouseInvalidStateError(
        `Sayım kaydı alınamaz. Oturum ${session.status} durumunda (Beklenen: IN_PROGRESS veya RECOUNT_REQUIRED).`
      )
    }

    if (input.countedQuantity < 0) {
      throw new WarehouseValidationError('Sayılan miktar negatif olamaz.')
    }

    // 1. Resolve Location
    let targetLocation = null
    if (input.locationId) {
      targetLocation = await LocationService.getLocation(input.locationId)
    } else if (input.locationCode) {
      targetLocation = await LocationService.getLocationByCode(input.locationCode)
    }

    if (!targetLocation) {
      throw new WarehouseValidationError('Geçerli bir depo lokasyonu belirtilmelidir.')
    }

    // 2. Resolve Product identity
    const resolvedProduct = await WarehouseScanService.resolveProductIdentity(input.barcodeOrSku)

    const attempt = input.idempotencyAttempt || 1
    const lineKey = `${session.id}:${targetLocation.id}:${resolvedProduct.productId}`
    const idempotencyKey = `COUNT:${session.id}:${lineKey}:${attempt}`

    if (inMemoryIdempotencyKeys.has(idempotencyKey)) {
      const existingLine = Array.from(inMemoryLines.values()).find(
        (l) => l.sessionId === session.id && l.locationId === targetLocation.id && l.productId === resolvedProduct.productId
      )
      if (existingLine) {
        return {
          session,
          line: existingLine,
          idempotent: true,
        }
      }
    }

    return acquireCountMutex(lineKey, async () => {
      // Find or create matching count line
      let targetLine = Array.from(inMemoryLines.values()).find(
        (l) =>
          l.sessionId === session.id &&
          l.locationId === targetLocation.id &&
          (l.productId === resolvedProduct.productId || l.productId === 'NONE')
      )

      const now = new Date().toISOString()

      if (!targetLine) {
        // Operator found unexpected product in bin
        const newLineId = `count_line_${session.id}_${targetLocation.id}_${resolvedProduct.productId}`
        targetLine = {
          id: newLineId,
          sessionId: session.id,
          locationId: targetLocation.id,
          locationCode: targetLocation.code,
          productId: resolvedProduct.productId,
          sku: resolvedProduct.sku,
          barcode: resolvedProduct.barcode,
          productName: resolvedProduct.name,
          expectedQuantity: 0,
          countedQuantity: null,
          varianceQuantity: null,
          status: 'PENDING',
          countedAt: null,
          countedBy: null,
          recountCount: 0,
          countHistory: [],
          notes: null,
          createdAt: now,
          updatedAt: now,
        }
        inMemoryLines.set(newLineId, targetLine)
        if (!session.lines) session.lines = []
        session.lines.push(targetLine)
      } else if (targetLine.productId === 'NONE') {
        // Upgrading empty placeholder line to actual counted product
        targetLine.productId = resolvedProduct.productId
        targetLine.sku = resolvedProduct.sku
        targetLine.barcode = resolvedProduct.barcode
        targetLine.productName = resolvedProduct.name
      }

      // Record observation into count history (maintaining COUNT #1, COUNT #2, COUNT #3)
      const currentAttemptNumber = targetLine.countHistory.length + 1
      targetLine.countHistory.push({
        attempt: currentAttemptNumber,
        countedQuantity: input.countedQuantity,
        countedBy: input.countedBy,
        countedAt: now,
        notes: input.notes,
      })

      targetLine.countedQuantity = input.countedQuantity
      targetLine.countedBy = input.countedBy
      targetLine.countedAt = now
      targetLine.varianceQuantity = input.countedQuantity - targetLine.expectedQuantity
      targetLine.updatedAt = now

      let ticket: WarehouseReconciliationTicketRecord | undefined

      if (targetLine.varianceQuantity === 0) {
        targetLine.status = 'VERIFIED'
      } else {
        // Discrepancy detected
        targetLine.status = 'UNDER_REVIEW'

        // Check for existing open ticket for this line
        const existingTicket = Array.from(inMemoryTickets.values()).find(
          (t) => t.countLineId === targetLine.id && t.status !== 'CANCELLED' && t.status !== 'RESOLVED'
        )

        if (existingTicket) {
          existingTicket.countedQuantity = targetLine.countedQuantity
          existingTicket.varianceQuantity = targetLine.varianceQuantity
          existingTicket.updatedAt = now
          ticket = existingTicket
        } else {
          const ticketId = `rec_tkt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
          const ticketNumber = `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
            1000 + Math.random() * 9000
          )}`

          ticket = {
            id: ticketId,
            ticketNumber,
            countSessionId: session.id,
            countLineId: targetLine.id,
            storeId: session.storeId,
            locationId: targetLine.locationId,
            locationCode: targetLine.locationCode,
            productId: targetLine.productId,
            sku: targetLine.sku,
            productName: targetLine.productName,
            expectedQuantity: targetLine.expectedQuantity,
            countedQuantity: targetLine.countedQuantity,
            varianceQuantity: targetLine.varianceQuantity,
            status: 'OPEN',
            reason: `Fiziksel Sayım Farkı: Sistem=${targetLine.expectedQuantity}, Sayılan=${targetLine.countedQuantity}, Fark=${targetLine.varianceQuantity}`,
            createdBy: input.countedBy,
            reviewedBy: null,
            approvedAt: null,
            resolvedAt: null,
            resolution: null,
            auditReference: null,
            idempotencyKey: `RECON_TICKET:${session.id}:${targetLine.id}:${currentAttemptNumber}`,
            createdAt: now,
            updatedAt: now,
          }

          inMemoryTickets.set(ticketId, ticket)
          if (!session.tickets) session.tickets = []
          session.tickets.push(ticket)
        }
      }

      inMemoryIdempotencyKeys.add(idempotencyKey)

      // Evaluate overall session status
      const lines = session.lines || []
      const allCounted = lines.every((l) => l.countedQuantity !== null)

      if (allCounted && lines.length > 0) {
        const hasRecount = lines.some((l) => l.status === 'RECOUNT_REQUIRED')
        const hasVariance = lines.some((l) => l.varianceQuantity !== 0)

        if (hasRecount) {
          session.status = 'RECOUNT_REQUIRED'
        } else if (hasVariance) {
          session.status = 'UNDER_REVIEW'
        } else {
          session.status = 'COUNTED'
          session.completedAt = now
        }
      }

      session.updatedAt = now

      await logAuditEvent({
        action: 'warehouse.count.scan_submitted',
        entity: 'WarehouseCountLine',
        entityId: targetLine.id,
        userId: input.countedBy,
        metadata: {
          sessionId: session.id,
          locationCode: targetLocation.code,
          sku: targetLine.sku,
          countedQuantity: input.countedQuantity,
          expectedQuantity: targetLine.expectedQuantity,
          varianceQuantity: targetLine.varianceQuantity,
          attempt: currentAttemptNumber,
        },
      })

      return {
        session,
        line: targetLine,
        ticket,
      }
    })
  }

  /**
   * Requests a recount for a line with discrepancy.
   * Increments recountCount and maintains immutable count history.
   */
  public static async requestRecount(
    sessionId: string,
    lineId: string,
    requestedBy: string,
    notes?: string
  ): Promise<WarehouseCountLineRecord> {
    const session = inMemorySessions.get(sessionId)
    if (!session) {
      throw new WarehouseNotFoundError(`Sayım oturumu bulunamadı (ID: ${sessionId}).`)
    }

    const line = inMemoryLines.get(lineId)
    if (!line || line.sessionId !== sessionId) {
      throw new WarehouseNotFoundError(`Sayım kalemi bulunamadı (ID: ${lineId}).`)
    }

    line.recountCount += 1
    line.status = 'RECOUNT_REQUIRED'
    line.notes = notes || line.notes
    line.updatedAt = new Date().toISOString()

    session.status = 'RECOUNT_REQUIRED'
    session.updatedAt = line.updatedAt

    await logAuditEvent({
      action: 'warehouse.count.recount_requested',
      entity: 'WarehouseCountLine',
      entityId: lineId,
      userId: requestedBy,
      metadata: {
        sessionId,
        sku: line.sku,
        recountCount: line.recountCount,
        notes,
      },
    })

    return line
  }

  /**
   * Approves a variance reconciliation ticket
   */
  public static async approveTicket(
    ticketId: string,
    adminUserId: string,
    notes?: string
  ): Promise<WarehouseReconciliationTicketRecord> {
    const ticket = inMemoryTickets.get(ticketId)
    if (!ticket) {
      throw new WarehouseNotFoundError(`Uzlaştırma bileti bulunamadı (ID: ${ticketId}).`)
    }

    if (ticket.status === 'RESOLVED') {
      throw new WarehouseInvalidStateError('Zaten çözümlenmiş bilet tekrar onaylanamaz.')
    }

    const now = new Date().toISOString()
    ticket.status = 'APPROVED'
    ticket.reviewedBy = adminUserId
    ticket.approvedAt = now
    ticket.resolution = notes || 'Fark onaylandı. Stok düzeltmeye hazır.'
    ticket.updatedAt = now

    await logAuditEvent({
      action: 'warehouse.count.ticket_approved',
      entity: 'WarehouseReconciliationTicket',
      entityId: ticketId,
      userId: adminUserId,
      metadata: {
        ticketNumber: ticket.ticketNumber,
        varianceQuantity: ticket.varianceQuantity,
      },
    })

    return ticket
  }

  /**
   * Rejects a variance ticket (e.g. invalid physical count, requires re-investigation)
   */
  public static async rejectTicket(
    ticketId: string,
    adminUserId: string,
    reason: string
  ): Promise<WarehouseReconciliationTicketRecord> {
    const ticket = inMemoryTickets.get(ticketId)
    if (!ticket) {
      throw new WarehouseNotFoundError(`Uzlaştırma bileti bulunamadı (ID: ${ticketId}).`)
    }

    if (ticket.status === 'RESOLVED') {
      throw new WarehouseInvalidStateError('Çözümlenmiş bilet reddedilemez.')
    }

    const now = new Date().toISOString()
    ticket.status = 'REJECTED'
    ticket.reviewedBy = adminUserId
    ticket.resolution = reason
    ticket.updatedAt = now

    await logAuditEvent({
      action: 'warehouse.count.ticket_rejected',
      entity: 'WarehouseReconciliationTicket',
      entityId: ticketId,
      userId: adminUserId,
      metadata: {
        ticketNumber: ticket.ticketNumber,
        reason,
      },
    })

    return ticket
  }

  /**
   * Authoritatively reconciles an approved ticket:
   *  1. Calls existing InventoryService.adjustInventory (never direct mutation from warehouse code)
   *  2. Records physical location movement ledger (COUNT_ADJUSTMENT)
   *  3. Updates location inventory projection
   *  4. Enforces idempotency via COUNT_RECONCILE:{ticketId}
   *  5. Updates session status to RECONCILED when all tickets resolved
   */
  public static async reconcileTicket(
    ticketId: string,
    adminUserId: string
  ): Promise<{
    ticket: WarehouseReconciliationTicketRecord
    adjustment: { previousStock: number; newStock: number }
    idempotent?: boolean
  }> {
    const ticket = inMemoryTickets.get(ticketId)
    if (!ticket) {
      throw new WarehouseNotFoundError(`Uzlaştırma bileti bulunamadı (ID: ${ticketId}).`)
    }

    const idempotencyKey = `COUNT_RECONCILE:${ticket.id}`

    if (ticket.status === 'RESOLVED' || inMemoryIdempotencyKeys.has(idempotencyKey)) {
      const current = await getInventoryStatus(ticket.productId)
      return {
        ticket,
        adjustment: { previousStock: current.stock, newStock: current.stock },
        idempotent: true,
      }
    }

    if (ticket.status !== 'APPROVED') {
      throw new WarehouseInvalidStateError(
        `Uzlaştırma uygulanamaz. Bilet '${ticket.status}' durumunda (Beklenen: APPROVED).`
      )
    }

    return acquireCountMutex(idempotencyKey, async () => {
      if (ticket.status === 'RESOLVED' || inMemoryIdempotencyKeys.has(idempotencyKey)) {
        const current = await getInventoryStatus(ticket.productId)
        return {
          ticket,
          adjustment: { previousStock: current.stock, newStock: current.stock },
          idempotent: true,
        }
      }

      // 1. Authoritative Central Inventory Adjustment via Phase 18/22 InventoryService
      const adjResult = await adjustInventory(ticket.productId, ticket.varianceQuantity, {
        reason: `CYCLE_COUNT_ADJUSTMENT (#${ticket.ticketNumber})`,
        adminUserId,
        storeId: ticket.storeId,
        referenceId: ticket.ticketNumber,
        idempotencyKey: `INV_ADJ_RECON:${ticket.id}`,
      })

      // 2. Physical Location Movement & Projection update
      const now = new Date().toISOString()
      const absQty = Math.abs(ticket.varianceQuantity)

      if (ticket.varianceQuantity > 0) {
        // Physical gain: add to location
        await LocationService.recordMovement({
          warehouseId: 'MAIN',
          movementType: 'COUNT_ADJUSTMENT',
          sourceLocationId: null,
          destinationLocationId: ticket.locationId,
          productId: ticket.productId,
          sku: ticket.sku,
          quantity: absQty,
          operatorId: adminUserId,
          referenceId: ticket.ticketNumber,
          idempotencyKey: `LOC_MOV_GAIN:${ticket.id}`,
          notes: `Sayım Fazlası Kabul Edildi (#${ticket.ticketNumber})`,
        })
      } else if (ticket.varianceQuantity < 0) {
        // Physical shortage: deduct from location
        await LocationService.recordMovement({
          warehouseId: 'MAIN',
          movementType: 'COUNT_ADJUSTMENT',
          sourceLocationId: ticket.locationId,
          destinationLocationId: null,
          productId: ticket.productId,
          sku: ticket.sku,
          quantity: absQty,
          operatorId: adminUserId,
          referenceId: ticket.ticketNumber,
          idempotencyKey: `LOC_MOV_LOSS:${ticket.id}`,
          notes: `Sayım Eksiği Onaylandı (#${ticket.ticketNumber})`,
        })
      }

      // 3. Mark ticket and line as RESOLVED / RECONCILED
      ticket.status = 'RESOLVED'
      ticket.resolvedAt = now
      ticket.auditReference = `TX_RECON_${ticket.ticketNumber}`
      ticket.updatedAt = now

      const line = inMemoryLines.get(ticket.countLineId)
      if (line) {
        line.status = 'RECONCILED'
        line.updatedAt = now
      }

      inMemoryIdempotencyKeys.add(idempotencyKey)

      // 4. Update session status if all tickets in session are resolved
      const session = inMemorySessions.get(ticket.countSessionId)
      if (session) {
        const sessionTickets = session.tickets || []
        const allResolved = sessionTickets.every(
          (t) => t.status === 'RESOLVED' || t.status === 'REJECTED' || t.status === 'CANCELLED'
        )

        if (allResolved) {
          session.status = 'RECONCILED'
          session.approvedAt = now
          session.updatedAt = now
        }
      }

      await logAuditEvent({
        action: 'warehouse.count.ticket_resolved',
        entity: 'WarehouseReconciliationTicket',
        entityId: ticket.id,
        userId: adminUserId,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          productId: ticket.productId,
          varianceQuantity: ticket.varianceQuantity,
          newPhysicalStock: adjResult.newStock,
        },
      })

      return {
        ticket,
        adjustment: {
          previousStock: adjResult.previousStock,
          newStock: adjResult.newStock,
        },
      }
    })
  }

  /**
   * Retrieves a count session by ID.
   * If blindMode is true and hideExpected is requested (or non-admin),
   * strictly masks expectedQuantity and varianceQuantity from unsubmitted lines.
   */
  public static async getSession(
    sessionId: string,
    options: { maskBlind?: boolean; storeId?: string | null } = {}
  ): Promise<WarehouseCountSessionRecord | null> {
    const session = inMemorySessions.get(sessionId)
    if (!session) return null

    // Store isolation check
    if (options.storeId !== undefined && session.storeId !== null && session.storeId !== options.storeId) {
      throw new WarehouseValidationError('Bu mağaza bağlamında bu sayım oturumuna erişim yetkiniz yoktur.')
    }

    const lines = Array.from(inMemoryLines.values()).filter((l) => l.sessionId === sessionId)
    const tickets = Array.from(inMemoryTickets.values()).filter((t) => t.countSessionId === sessionId)

    const shouldMask = options.maskBlind !== undefined ? options.maskBlind : session.blindMode

    const projectedLines: WarehouseCountLineRecord[] = lines.map((l) => {
      // In blindMode: operator must NOT receive expectedQuantity before physical count submission!
      if (shouldMask && l.countedQuantity === null) {
        return {
          ...l,
          expectedQuantity: -1, // Masked
          varianceQuantity: null,
        }
      }
      return l
    })

    return {
      ...session,
      lines: projectedLines,
      tickets,
    }
  }

  /**
   * Lists count sessions with store isolation and filters
   */
  public static async listSessions(filters: {
    storeId?: string | null
    status?: WarehouseCountSessionStatus
    warehouseId?: string
  } = {}): Promise<WarehouseCountSessionRecord[]> {
    let list = Array.from(inMemorySessions.values())

    if (filters.warehouseId) {
      list = list.filter((s) => s.warehouseId === filters.warehouseId)
    }

    if (filters.status) {
      list = list.filter((s) => s.status === filters.status)
    }

    if (filters.storeId !== undefined) {
      list = list.filter((s) => s.storeId === null || s.storeId === filters.storeId)
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
