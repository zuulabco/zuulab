import 'server-only'
import { db } from '@/prisma/db'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  limit: number
}

/**
 * Fixed-window rate limiter backed by Postgres, so the limit holds across every
 * serverless instance (an in-memory counter would reset per instance).
 *
 * One atomic upsert per call: the row's window restarts once it has ended,
 * otherwise its count is incremented.
 *
 * Fails open: if the database is unreachable the request is allowed, because
 * blocking every customer is worse than briefly not limiting.
 *
 * @param key Unique identifier, e.g. `contact:ip:1.2.3.4`
 * @param limit Maximum requests per window
 * @param windowSeconds Window length in seconds
 */
export async function checkRateLimit(key: string, limit = 60, windowSeconds = 60): Promise<RateLimitResult> {
  const rateKey = key.slice(0, 200)
  try {
    const [row] = (await db.runtime().query(
      db.raw.sql`
        INSERT INTO rate_limits (key, count, window_ends_at)
        VALUES (${rateKey}, 1, now() + make_interval(secs => ${windowSeconds}))
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limits.window_ends_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
          window_ends_at = CASE WHEN rate_limits.window_ends_at <= now()
            THEN now() + make_interval(secs => ${windowSeconds})
            ELSE rate_limits.window_ends_at END
        RETURNING count, (extract(epoch from (window_ends_at - now())) * 1000)::int AS reset_ms
      `
        .returnsRow({ count: 'pg/int4@1', reset_ms: 'pg/int4@1' } as never)
        .build()
    )) as unknown as Array<{ count: number; reset_ms: number }>

    // Occasionally prune expired windows so the table stays small.
    if (Math.random() < 0.01) {
      db.runtime()
        .execute(db.raw.sql`DELETE FROM rate_limits WHERE window_ends_at < now() - interval '1 day'`.affectedCount().build())
        .catch(() => {})
    }

    const count = Number(row?.count ?? 1)
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs: Math.max(0, Number(row?.reset_ms ?? windowSeconds * 1000)),
      limit,
    }
  } catch (err) {
    console.error('[rate-limiter] check failed, allowing request:', err)
    return { allowed: true, remaining: limit, resetMs: windowSeconds * 1000, limit }
  }
}
