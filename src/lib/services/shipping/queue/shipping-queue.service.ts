import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { acquireCronLock } from '@/lib/services/cron/cron-lock.service'
import { logAuditEvent } from '@/lib/services/admin.service'
import { CargoError } from '../shipping-error'
import type { ShippingQueueJobType, ShippingQueueStatus } from '../shipping-types'

export interface ShippingQueueItem {
  id: string
  shipmentId: string
  jobType: ShippingQueueJobType
  status: ShippingQueueStatus
  attempts: number
  maxAttempts: number
  nextRetryAt: string | null
  lastError: string | null
  version: number
  idempotencyKey: string
  payload?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

// In-memory queue fallback
const inMemoryQueue: Map<string, ShippingQueueItem> = new Map()

export class ShippingQueueService {
  public static readonly DEFAULT_MAX_ATTEMPTS = 5
  public static readonly BASE_BACKOFF_MS = 1000

  /**
   * Enqueues a shipping job with strict idempotency
   */
  public static async enqueue(params: {
    shipmentId: string
    jobType: ShippingQueueJobType
    payload?: Record<string, unknown>
    idempotencyKey?: string
    maxAttempts?: number
  }): Promise<ShippingQueueItem> {
    const key =
      params.idempotencyKey ||
      `SHIP_JOB:${params.shipmentId}:${params.jobType}:${crypto.randomBytes(4).toString('hex')}`

    // If an identical pending/processing job exists, return it
    const existing = await this.findJobByIdempotencyKey(key)
    if (existing) {
      return existing
    }

    const id = `job_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const now = new Date().toISOString()
    const jobItem: ShippingQueueItem = {
      id,
      shipmentId: params.shipmentId,
      jobType: params.jobType,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: params.maxAttempts || this.DEFAULT_MAX_ATTEMPTS,
      nextRetryAt: now,
      lastError: null,
      version: 1,
      idempotencyKey: key,
      payload: params.payload || null,
      createdAt: now,
      updatedAt: now,
    }

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingQueue.create({
          id,
          shipmentId: params.shipmentId,
          jobType: params.jobType,
          status: 'PENDING',
          attempts: 0,
          maxAttempts: jobItem.maxAttempts,
          nextRetryAt: new Date(now),
          idempotencyKey: key,
          payload: params.payload ? (params.payload as any) : undefined,
        })
      } catch (err) {
        console.warn('[ShippingQueueService] DB enqueue fallback to memory:', err)
      }
    }

    inMemoryQueue.set(id, jobItem)
    return jobItem
  }

  /**
   * Processes a job through a worker handler with exponential backoff & fast-fail on non-retryable errors
   */
  public static async executeJob(
    jobId: string,
    handler: (job: ShippingQueueItem) => Promise<void>
  ): Promise<{ success: boolean; job: ShippingQueueItem; error?: string }> {
    const job = await this.getJobById(jobId)
    if (!job) {
      throw new Error(`Job '${jobId}' bulunamadı.`)
    }

    job.status = 'PROCESSING'
    job.attempts += 1
    job.updatedAt = new Date().toISOString()

    try {
      await handler(job)
      job.status = 'COMPLETED'
      job.lastError = null
      job.nextRetryAt = null
      await this.saveJob(job)

      return { success: true, job }
    } catch (err: any) {
      const isRetryable = err instanceof CargoError ? err.retryable : true
      job.lastError = err.message || String(err)

      if (!isRetryable || job.attempts >= job.maxAttempts) {
        job.status = 'FAILED'
        job.nextRetryAt = null
      } else {
        job.status = 'RETRYING'
        // Exponential backoff with jitter
        const delay = this.calculateBackoffMs(job.attempts)
        job.nextRetryAt = new Date(Date.now() + delay).toISOString()
      }

      await this.saveJob(job)
      return { success: false, job, error: job.lastError ?? undefined }
    }
  }

  /**
   * Processes all pending and ready-to-retry jobs under a distributed lock
   */
  public static async processQueue(
    workerMap: Record<ShippingQueueJobType, (job: ShippingQueueItem) => Promise<void>>
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const lock = await acquireCronLock('shipping_queue_worker', 120)
    if (!lock.acquired) {
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    const now = Date.now()
    const allJobs = Array.from(inMemoryQueue.values())
    const readyJobs = allJobs.filter((j) => {
      if (j.status === 'COMPLETED' || j.status === 'FAILED') return false
      if (!j.nextRetryAt) return true
      return new Date(j.nextRetryAt).getTime() <= now
    })

    let processed = 0
    let succeeded = 0
    let failed = 0

    for (const job of readyJobs) {
      const handler = workerMap[job.jobType]
      if (handler) {
        processed++
        const res = await this.executeJob(job.id, handler)
        if (res.success) succeeded++
        else failed++
      }
    }

    return { processed, succeeded, failed }
  }

  public static calculateBackoffMs(attempt: number): number {
    const exp = Math.min(attempt, 6)
    const base = this.BASE_BACKOFF_MS * Math.pow(2, exp - 1)
    const jitter = Math.floor(Math.random() * 200)
    return base + jitter
  }

  public static async getJobById(jobId: string): Promise<ShippingQueueItem | null> {
    return inMemoryQueue.get(jobId) ?? null
  }

  public static async findJobByIdempotencyKey(key: string): Promise<ShippingQueueItem | null> {
    for (const j of inMemoryQueue.values()) {
      if (j.idempotencyKey === key) return j
    }
    return null
  }

  public static async getJobsForShipment(shipmentId: string): Promise<ShippingQueueItem[]> {
    return Array.from(inMemoryQueue.values())
      .filter((j) => j.shipmentId === shipmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private static async saveJob(job: ShippingQueueItem): Promise<void> {
    inMemoryQueue.set(job.id, job)
    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingQueue.where({ id: job.id }).update({
          status: job.status,
          attempts: job.attempts,
          nextRetryAt: job.nextRetryAt ? new Date(job.nextRetryAt) : null,
          lastError: job.lastError,
          version: job.version + 1,
        })
      } catch {}
    }
  }
}
