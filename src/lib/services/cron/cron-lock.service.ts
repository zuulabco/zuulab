import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'

// Local in-memory lock fallback for development/testing
const memoryLocks = new Map<string, number>()

export interface CronAuthResult {
  authorized: boolean
  error?: string
  status: 200 | 401 | 403
}

/**
 * Validates CRON_SECRET from Authorization header or x-cron-secret header.
 * Unauthorized requests strictly receive 401 / 403.
 */
export function verifyCronAuthorization(request: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  const authHeader = request.headers.get('authorization') || ''
  const cronHeader = request.headers.get('x-cron-secret') || ''

  const providedToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : cronHeader.trim()

  if (isProduction) {
    if (!cronSecret) {
      return {
        authorized: false,
        error: 'CRON_SECRET is not configured on server.',
        status: 403,
      }
    }
    if (!providedToken || providedToken !== cronSecret) {
      return {
        authorized: false,
        error: 'Unauthorized: Invalid or missing cron secret token.',
        status: 401,
      }
    }
    return { authorized: true, status: 200 }
  }

  // Development / test environment
  if (cronSecret && providedToken !== cronSecret) {
    return {
      authorized: false,
      error: 'Unauthorized: Invalid cron secret token.',
      status: 401,
    }
  }

  return { authorized: true, status: 200 }
}

export interface CronLockResult {
  acquired: boolean
  jobName: string
  reason?: string
}

/**
 * Distributed lease/lock for serverless cron jobs to prevent concurrent duplicate executions.
 * Uses PostgreSQL Setting table in production, in-memory Map in local development.
 *
 * @param jobName Unique identifier for the cron task (e.g. 'notifications_process')
 * @param ttlSeconds Lock expiration time in seconds (default 300s = 5 minutes)
 */
export async function acquireCronLock(
  jobName: string,
  ttlSeconds: number = 300
): Promise<CronLockResult> {
  const lockKey = `cron_lock:${jobName}`
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  if (isDatabaseConfigured) {
    try {
      const existing = await (db.orm.public.Setting as any).findUnique({
        where: { key: lockKey },
      })

      if (existing && existing.value) {
        const lockTime = new Date(existing.value).getTime()
        const ageSeconds = (now - lockTime) / 1000

        // If another instance acquired the lock within TTL, reject concurrent run
        if (ageSeconds < ttlSeconds) {
          return {
            acquired: false,
            jobName,
            reason: `LOCKED_BY_ANOTHER_INSTANCE (active for ${Math.round(ttlSeconds - ageSeconds)}s more)`,
          }
        }
      }

      // Update or insert lock timestamp
      await (db.orm.public.Setting as any).upsert({
        where: { key: lockKey },
        update: { value: nowIso, group: 'cron' },
        create: { key: lockKey, value: nowIso, group: 'cron', type: 'string' },
      })

      return { acquired: true, jobName }
    } catch (err) {
      console.warn('[cron-lock] DB lock failed, checking memory:', err)
    }
  }

  // In-memory fallback
  const lastTime = memoryLocks.get(jobName) || 0
  const ageSeconds = (now - lastTime) / 1000
  if (ageSeconds < ttlSeconds) {
    return {
      acquired: false,
      jobName,
      reason: `LOCKED_BY_ANOTHER_INSTANCE (memory lock: ${Math.round(ttlSeconds - ageSeconds)}s remaining)`,
    }
  }

  memoryLocks.set(jobName, now)
  return { acquired: true, jobName }
}

/**
 * Releases the distributed cron lock once execution completes.
 */
export async function releaseCronLock(jobName: string): Promise<void> {
  const lockKey = `cron_lock:${jobName}`
  memoryLocks.delete(jobName)

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public.Setting as any).deleteMany({
        where: { key: lockKey },
      })
    } catch {
      // Ignored
    }
  }
}
