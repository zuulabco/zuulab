import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'

// Per-process lock, only when no database is configured (local development)
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
 * Distributed lease for cron jobs and syncs, shared by every serverless instance.
 *
 * One atomic statement on the `settings` table: the lock row is inserted, or taken
 * over only if its lease has expired; whoever gets a row back owns the lock. A crashed
 * holder can never block a job longer than `ttlSeconds`.
 *
 * Fails closed in production: if the database cannot be asked, the job does not run
 * (it could not do its work without the database anyway). Only without any database
 * (local development) is a per-process lock used.
 *
 * @param jobName Unique identifier for the task (e.g. 'notifications_process')
 * @param ttlSeconds Lease length in seconds (default 300s = 5 minutes)
 */
export async function acquireCronLock(
  jobName: string,
  ttlSeconds: number = 300
): Promise<CronLockResult> {
  const lockKey = `cron_lock:${jobName}`
  const now = Date.now()

  if (isDatabaseConfigured) {
    try {
      const rows = (await db.runtime().query(
        db.raw.sql`
          INSERT INTO settings (id, key, value, type, "group", updated_at)
          VALUES (gen_random_uuid()::text, ${lockKey}, ${new Date(now).toISOString()}, 'string', 'cron', now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
          WHERE settings.value::timestamptz < now() - make_interval(secs => ${ttlSeconds})
          RETURNING key
        `
          .returnsRow({ key: 'pg/text@1' } as never)
          .build()
      )) as unknown as Array<{ key: string }>
      return rows.length === 1
        ? { acquired: true, jobName }
        : { acquired: false, jobName, reason: 'LOCKED_BY_ANOTHER_INSTANCE' }
    } catch (err) {
      console.error(JSON.stringify({ event: 'cron.lock.failed', job: jobName, error: (err as Error).message }))
      if (process.env.NODE_ENV === 'production') {
        return { acquired: false, jobName, reason: 'LOCK_UNAVAILABLE' }
      }
    }
  }

  const lastTime = memoryLocks.get(jobName) || 0
  if ((now - lastTime) / 1000 < ttlSeconds) {
    return { acquired: false, jobName, reason: 'LOCKED_BY_ANOTHER_INSTANCE (memory lock)' }
  }
  memoryLocks.set(jobName, now)
  return { acquired: true, jobName }
}

/**
 * Releases the lock once execution completes.
 */
export async function releaseCronLock(jobName: string): Promise<void> {
  memoryLocks.delete(jobName)
  if (!isDatabaseConfigured) return
  try {
    await db
      .runtime()
      .execute(db.raw.sql`DELETE FROM settings WHERE key = ${`cron_lock:${jobName}`}`.affectedCount().build())
  } catch (err) {
    // The lease expires on its own.
    console.error(JSON.stringify({ event: 'cron.unlock.failed', job: jobName, error: (err as Error).message }))
  }
}
