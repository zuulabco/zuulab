import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { WarehouseService } from './warehouse.service'
import {
  WarehouseNotFoundError,
  WarehouseValidationError,
  WarehouseInvalidStateError,
} from './warehouse-error'
import type {
  WarehouseExceptionRecord,
  WarehouseExceptionType,
  WarehouseExceptionStatus,
} from './warehouse-types'

const inMemoryExceptions: Map<string, WarehouseExceptionRecord> = new Map()

export class WarehouseExceptionService {
  /**
   * Creates a warehouse exception and flags the fulfillment as BLOCKED if severe
   */
  public static async createException(input: {
    fulfillmentId: string
    fulfillmentItemId?: string | null
    type: WarehouseExceptionType
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    description: string
    createdBy: string
  }): Promise<WarehouseExceptionRecord> {
    let fulfillment: any = null
    try {
      fulfillment = await WarehouseService.getFulfillment(input.fulfillmentId)
    } catch (err) {
      if (!input.fulfillmentId.startsWith('return_') && !input.fulfillmentId.startsWith('reconcile_')) {
        throw err
      }
    }

    const exceptionId = `exc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()
    const severity = input.severity || 'MEDIUM'

    const record: WarehouseExceptionRecord = {
      id: exceptionId,
      fulfillmentId: input.fulfillmentId,
      fulfillmentItemId: input.fulfillmentItemId || null,
      type: input.type,
      status: 'OPEN',
      severity,
      description: input.description,
      createdBy: input.createdBy,
      resolvedBy: null,
      resolution: null,
      createdAt: now,
      resolvedAt: null,
    }

    inMemoryExceptions.set(exceptionId, record)

    // Severe exceptions block the fulfillment workflow
    if (fulfillment && (severity === 'HIGH' || severity === 'CRITICAL' || input.type === 'SHORT_PICK')) {
      try {
        await WarehouseService.updateFulfillmentStatus(
          input.fulfillmentId,
          'BLOCKED',
          input.createdBy
        )
      } catch (err) {
        console.warn('[WarehouseExceptionService] Status transition to BLOCKED warning:', err)
      }
    }

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseException as any).create({
          data: {
            id: record.id,
            fulfillmentId: record.fulfillmentId,
            fulfillmentItemId: record.fulfillmentItemId,
            type: record.type,
            status: record.status,
            severity: record.severity,
            description: record.description,
            createdBy: record.createdBy,
            createdAt: new Date(now),
          },
        })
      } catch (err) {
        console.warn('[WarehouseExceptionService] DB save exception fallback to memory:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.exception.created',
      entity: 'WarehouseException',
      entityId: exceptionId,
      metadata: {
        fulfillmentId: input.fulfillmentId,
        type: input.type,
        severity,
        createdBy: input.createdBy,
      },
    })

    return record
  }

  /**
   * Resolves a warehouse exception
   */
  public static async resolveException(input: {
    exceptionId: string
    resolvedBy: string
    resolution: string
    unblockFulfillment?: boolean
  }): Promise<WarehouseExceptionRecord> {
    const record = inMemoryExceptions.get(input.exceptionId)
    if (!record) {
      throw new WarehouseNotFoundError(`İstisna kaydı bulunamadı: ${input.exceptionId}`)
    }

    if (record.status === 'RESOLVED') {
      return record
    }

    const now = new Date().toISOString()
    record.status = 'RESOLVED'
    record.resolvedBy = input.resolvedBy
    record.resolution = input.resolution
    record.resolvedAt = now

    inMemoryExceptions.set(input.exceptionId, record)

    // If requested or if no other open exceptions remain, unblock fulfillment
    if (input.unblockFulfillment) {
      const allForFul = Array.from(inMemoryExceptions.values()).filter(
        (e) => e.fulfillmentId === record.fulfillmentId && e.status === 'OPEN'
      )
      if (allForFul.length === 0) {
        try {
          await WarehouseService.updateFulfillmentStatus(
            record.fulfillmentId,
            'READY_TO_PICK',
            input.resolvedBy
          )
        } catch {
          // Ignored
        }
      }
    }

    await logAuditEvent({
      action: 'warehouse.exception.resolved',
      entity: 'WarehouseException',
      entityId: input.exceptionId,
      metadata: {
        resolvedBy: input.resolvedBy,
        resolution: input.resolution,
      },
    })

    return record
  }

  /**
   * List exceptions with optional filters
   */
  public static async listExceptions(filter?: {
    fulfillmentId?: string
    status?: WarehouseExceptionStatus
    type?: WarehouseExceptionType
  }): Promise<WarehouseExceptionRecord[]> {
    let list = Array.from(inMemoryExceptions.values())
    if (filter?.fulfillmentId) {
      list = list.filter((e) => e.fulfillmentId === filter.fulfillmentId)
    }
    if (filter?.status) {
      list = list.filter((e) => e.status === filter.status)
    }
    if (filter?.type) {
      list = list.filter((e) => e.type === filter.type)
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
}
