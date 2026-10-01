import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  limit: number
}

// In-memory fallback tracking for development/single instance
const localBuckets = new Map<string, { count: number; expiresAt: number }>()

/**
 * Serverless-compatible sliding window rate limiter.
 * Protects critical mutation endpoints against brute force and abuse.
 *
 * @param key Unique identifier (e.g. `ip:192.168.1.1` or `user:usr_123`)
 * @param limit Maximum allowed requests within the window
 * @param windowSeconds Window length in seconds (default 60s)
 */
export async function checkRateLimit(
  key: string,
  limit: number = 60,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const rateKey = `ratelimit:${key}`

  if (isDatabaseConfigured) {
    try {
      const existing = await (db.orm.public.Setting as any).findUnique({
        where: { key: rateKey },
      })

      if (existing && existing.value) {
        try {
          const parsed = JSON.parse(existing.value) as { count: number; expiresAt: number }
          if (now < parsed.expiresAt) {
            if (parsed.count >= limit) {
              return {
                allowed: false,
                remaining: 0,
                resetMs: parsed.expiresAt - now,
                limit,
              }
            }

            // Increment count within active window
            const newCount = parsed.count + 1
            await (db.orm.public.Setting as any).update({
              where: { key: rateKey },
              data: { value: JSON.stringify({ count: newCount, expiresAt: parsed.expiresAt }) },
            })

            return {
              allowed: true,
              remaining: limit - newCount,
              resetMs: parsed.expiresAt - now,
              limit,
            }
          }
        } catch {
          // If parse fails, reset below
        }
      }

      // New window creation
      const expiresAt = now + windowMs
      await (db.orm.public.Setting as any).upsert({
        where: { key: rateKey },
        update: { value: JSON.stringify({ count: 1, expiresAt }), group: 'rate_limit' },
        create: { key: rateKey, value: JSON.stringify({ count: 1, expiresAt }), group: 'rate_limit', type: 'json' },
      })

      return {
        allowed: true,
        remaining: limit - 1,
        resetMs: windowMs,
        limit,
      }
    } catch {
      // In case of transient DB failure, fall through to memory limiter
    }
  }

  // In-memory fallback
  const item = localBuckets.get(rateKey)
  if (item && now < item.expiresAt) {
    if (item.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: item.expiresAt - now,
        limit,
      }
    }
    item.count += 1
    return {
      allowed: true,
      remaining: limit - item.count,
      resetMs: item.expiresAt - now,
      limit,
    }
  }

  const expiresAt = now + windowMs
  localBuckets.set(rateKey, { count: 1, expiresAt })
  return {
    allowed: true,
    remaining: limit - 1,
    resetMs: windowMs,
    limit,
  }
}
