import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { WarehouseService } from './warehouse.service'
import { PickingService } from './picking.service'
import { PackingService } from './packing.service'
import { PackingSlipService } from './packing-slip.service'
import { ManifestService } from './manifest.service'
import {
  WarehouseError,
  WarehouseValidationError,
  WarehouseNotFoundError,
} from './warehouse-error'

export type WarehouseQueueJobType =
  | 'CREATE_FULFILLMENT'
  | 'GENERATE_PICK_LIST'
  | 'CREATE_SHIPMENT'
  | 'GENERATE_LABEL'
  | 'GENERATE_PACKING_SLIP'
  | 'CREATE_MANIFEST'

export type WarehouseQueueStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'

export interface WarehouseQueueItem {
  id: string
  jobType: WarehouseQueueJobType
  status: WarehouseQueueStatus
  attempts: number
  maxAttempts: number
  nextRetryAt: string | null
  lastError: string | null
  version: number
  idempotencyKey: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

const inMemoryWarehouseQueue: Map<string, WarehouseQueueItem> = new Map()

export class WarehouseQueueService {
  /**
   * Enqueues an asynchronous warehouse task with strict deduplication via idempotencyKey
   */
  public static async enqueue(
    jobType: WarehouseQueueJobType,
    idempotencyKey: string,
    payload: Record<string, unknown>,
    maxAttempts: number = 5
  ): Promise<WarehouseQueueItem> {
    // 1. Deduplication
    const existing = inMemoryWarehouseQueue.get(idempotencyKey)
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const jobItem: WarehouseQueueItem = {
      id: `wh_q_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      jobType,
      status: 'PENDING',
      attempts: 0,
      maxAttempts,
      nextRetryAt: null,
      lastError: null,
      version: 1,
      idempotencyKey,
      payload,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryWarehouseQueue.set(idempotencyKey, jobItem)

    await logAuditEvent({
      action: 'warehouse.queue.enqueued',
      entity: 'WarehouseQueue',
      entityId: jobItem.id,
      metadata: { jobType, idempotencyKey },
    })

    return jobItem
  }

  /**
   * Processes a job with retry classification and exponential backoff
   */
  public static async processJob(jobIdOrKey: string): Promise<{
    success: boolean
    status: WarehouseQueueStatus
    result?: unknown
    error?: string
  }> {
    let job = inMemoryWarehouseQueue.get(jobIdOrKey)
    if (!job) {
      for (const item of inMemoryWarehouseQueue.values()) {
        if (item.id === jobIdOrKey) {
          job = item
          break
        }
      }
    }

    if (!job) {
      throw new WarehouseNotFoundError(`Kuyruk işi bulunamadı: ${jobIdOrKey}`)
    }

    if (job.status === 'COMPLETED') {
      return { success: true, status: 'COMPLETED', result: 'Already completed' }
    }

    job.status = 'PROCESSING'
    job.attempts += 1
    job.updatedAt = new Date().toISOString()

    try {
      let executionResult: unknown = null

      switch (job.jobType) {
        case 'CREATE_FULFILLMENT':
          executionResult = await WarehouseService.createFulfillment(job.payload as any)
          break
        case 'GENERATE_PICK_LIST':
          executionResult = await PickingService.createPickList(
            job.payload.fulfillmentIds as string[],
            job.payload.operatorId as string | undefined
          )
          break
        case 'GENERATE_PACKING_SLIP':
          executionResult = await PackingSlipService.generatePackingSlip(
            job.payload.fulfillmentId as string
          )
          break
        case 'CREATE_MANIFEST':
          executionResult = await ManifestService.createManifest(job.payload as any)
          break
        default:
          throw new WarehouseValidationError(`Desteklenmeyen iş türü: ${job.jobType}`)
      }

      job.status = 'COMPLETED'
      job.lastError = null
      job.updatedAt = new Date().toISOString()

      return { success: true, status: 'COMPLETED', result: executionResult }
    } catch (err: any) {
      const errorMessage = err?.message || String(err)
      job.lastError = errorMessage
      job.updatedAt = new Date().toISOString()

      // Non-retryable validation errors fail fast without burning extra retries
      if (err instanceof WarehouseValidationError || err instanceof WarehouseNotFoundError) {
        job.status = 'FAILED'
        job.nextRetryAt = null
        return { success: false, status: 'FAILED', error: errorMessage }
      }

      // Retryable errors: apply exponential backoff (e.g. 2^attempts * 1000ms)
      if (job.attempts < job.maxAttempts) {
        job.status = 'RETRYING'
        const backoffMs = Math.min(30000, Math.pow(2, job.attempts) * 1000)
        job.nextRetryAt = new Date(Date.now() + backoffMs).toISOString()
      } else {
        job.status = 'FAILED'
        job.nextRetryAt = null
      }

      return { success: false, status: job.status, error: errorMessage }
    }
  }

  /**
   * Retrieves pending or retrying jobs ready for execution
   */
  public static getRunnableJobs(): WarehouseQueueItem[] {
    const now = Date.now()
    return Array.from(inMemoryWarehouseQueue.values()).filter((j) => {
      if (j.status === 'PENDING') return true
      if (j.status === 'RETRYING' && j.nextRetryAt) {
        return new Date(j.nextRetryAt).getTime() <= now
      }
      return false
    })
  }
}
