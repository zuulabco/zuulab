/** The cron lease must hold across instances: exactly one concurrent caller wins. */
import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'

const { acquireCronLock, releaseCronLock } = await import('@/lib/services/cron/cron-lock.service')
const JOB = `it-lock-${Date.now().toString(36)}`

afterAll(async () => {
  await releaseCronLock(JOB)
})

describe('cron lock', () => {
  it('lets exactly one of many concurrent callers in, and frees on release', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => acquireCronLock(JOB, 60)))
    expect(results.filter((r) => r.acquired)).toHaveLength(1)
    expect((await acquireCronLock(JOB, 60)).acquired).toBe(false)
    await releaseCronLock(JOB)
    expect((await acquireCronLock(JOB, 60)).acquired).toBe(true)
  }, 30000)

  it('takes over a lease that has expired', async () => {
    await releaseCronLock(JOB)
    expect((await acquireCronLock(JOB, 1)).acquired).toBe(true)
    await new Promise((r) => setTimeout(r, 1500))
    expect((await acquireCronLock(JOB, 1)).acquired).toBe(true)
  }, 30000)
})
