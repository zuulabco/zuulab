import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  getCachedMaintenanceState,
  isMaintenanceModeEnabled,
  resetCachedMaintenanceState,
  setCachedMaintenanceState,
} from '@/lib/config/maintenance'
import { proxy, resetProxyCache } from '@/proxy'

const storefront = () => new NextRequest('https://zuulab.com/', { headers: { host: 'zuulab.com', 'x-forwarded-for': '203.0.113.9' } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  resetCachedMaintenanceState()
  resetProxyCache()
  delete process.env.MAINTENANCE_MODE
  delete process.env.MAINTENANCE_ALLOWED_IPS
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('maintenance state is never trusted forever', () => {
  it('the in-process value expires', () => {
    setCachedMaintenanceState(true)
    expect(getCachedMaintenanceState().enabled).toBe(true)
    expect(isMaintenanceModeEnabled()).toBe(true)
    vi.advanceTimersByTime(6000)
    expect(getCachedMaintenanceState().enabled).toBeNull()
    expect(isMaintenanceModeEnabled()).toBe(false)
  })

  it('an instance that once saw maintenance=true serves the site again after it is switched off', async () => {
    // This instance cached "on" (e.g. when maintenance was last enabled) …
    setCachedMaintenanceState(true)
    vi.advanceTimersByTime(60_000)
    // … the setting is off in the database now
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) }))
    const res = await proxy(storefront())
    expect(res.status).not.toBe(503)
    expect(res.headers.get('X-Maintenance-Mode')).toBeNull()
  })

  it('still blocks while the setting is on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }))
    const res = await proxy(storefront())
    expect(res.status).toBe(503)
  })

it('serves the site when the status cannot be read, even though MAINTENANCE_MODE=true is set in the environment', async () => {
    // Production has MAINTENANCE_MODE="true" in Vercel while the database setting is off:
    // a failed or slow status check must not turn that stale variable into a maintenance page
    process.env.MAINTENANCE_MODE = 'true'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const res = await proxy(storefront())
    expect(res.status).not.toBe(503)
    expect(res.headers.get('X-Maintenance-Mode')).toBeNull()
  })

  it('still shows maintenance when the database setting is on, whatever the environment says', async () => {
    process.env.MAINTENANCE_MODE = 'false'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }))
    expect((await proxy(storefront())).status).toBe(503)
  })

  it('a long-stale "on" is not kept because the status endpoint is failing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true }) }))
    expect((await proxy(storefront())).status).toBe(503)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    vi.advanceTimersByTime(120_000)
    expect((await proxy(storefront())).status).not.toBe(503)
  })
})
