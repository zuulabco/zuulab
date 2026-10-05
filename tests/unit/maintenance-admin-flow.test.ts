import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The maintenance switch in the admin panel, end to end, with no MAINTENANCE_MODE variable
 * (it was removed from Vercel): panel setting → database → status endpoint → what a visitor gets.
 * The database is an in-memory stand-in for the settings table; everything else is the real code.
 */
const settings = new Map<string, { key: string; value: string; updatedAt: Date }>()

vi.mock('@/prisma/db', () => {
  const Setting = {
    where: ({ key }: { key: string }) => ({
      first: async () => settings.get(key) ?? null,
      update: async ({ value }: { value: string }) => {
        const row = settings.get(key)
        if (row) settings.set(key, { ...row, value, updatedAt: new Date() })
      },
    }),
    create: async (row: { key: string; value: string }) => void settings.set(row.key, { ...row, updatedAt: new Date() }),
  }
  return { db: { orm: { public: { Setting } } }, isDatabaseConfigured: true }
})

const { resetCachedMaintenanceState } = await import('@/lib/config/maintenance')
const { getMaintenanceModeStatus, setMaintenanceModeStatus } = await import('@/lib/services/settings/maintenance-settings.service')
const { GET: statusRoute } = await import('@/app/api/maintenance/status/route')
const { proxy, resetProxyCache } = await import('@/proxy')

const visitor = () => new NextRequest('https://zuulab.com/', { headers: { host: 'zuulab.com', 'x-forwarded-for': '203.0.113.9' } })

/** What another server instance sees: no memory of earlier state, only the database */
const freshInstance = () => {
  resetCachedMaintenanceState()
  resetProxyCache()
}

beforeEach(() => {
  settings.clear()
  delete process.env.MAINTENANCE_MODE
  delete process.env.MAINTENANCE_ALLOWED_IPS
  freshInstance()
  // the proxy asks the real status endpoint, as it does in production
  vi.stubGlobal('fetch', vi.fn(async () => statusRoute()))
})
afterEach(() => vi.unstubAllGlobals())

describe('maintenance mode from the admin panel, without the environment variable', () => {
  it('is off by default: the site is served', async () => {
    expect((await getMaintenanceModeStatus()).enabled).toBe(false)
    expect((await proxy(visitor())).status).not.toBe(503)
  })

  it('turning it on in the panel closes the storefront for visitors, on this instance and on any other', async () => {
    const status = await setMaintenanceModeStatus(true, 'admin@zuulab.co')
    expect(status).toMatchObject({ enabled: true, source: 'database' })
    expect((await proxy(visitor())).status).toBe(503) // the instance that handled the click

    freshInstance() // another instance knows only the database
    const res = await proxy(visitor())
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Maintenance-Mode')).toBe('active')
  })

  it('turning it off in the panel opens the storefront again, on any instance', async () => {
    await setMaintenanceModeStatus(true, 'admin@zuulab.co')
    await setMaintenanceModeStatus(false, 'admin@zuulab.co')
    expect((await proxy(visitor())).status).not.toBe(503)

    freshInstance()
    const res = await proxy(visitor())
    expect(res.status).not.toBe(503)
    expect(res.headers.get('X-Maintenance-Mode')).toBeNull()
  })

  it('the panel setting wins over a leftover MAINTENANCE_MODE variable, in both directions', async () => {
    process.env.MAINTENANCE_MODE = 'true'
    await setMaintenanceModeStatus(false, 'admin@zuulab.co')
    freshInstance()
    expect((await proxy(visitor())).status).not.toBe(503)

    process.env.MAINTENANCE_MODE = 'false'
    await setMaintenanceModeStatus(true, 'admin@zuulab.co')
    freshInstance()
    expect((await proxy(visitor())).status).toBe(503)
  })

  it('the admin panel itself stays reachable while the storefront is closed', async () => {
    await setMaintenanceModeStatus(true, 'admin@zuulab.co')
    freshInstance()
    const dashboard = new NextRequest('https://dashboard.zuulab.com/orders', { headers: { host: 'dashboard.zuulab.com', 'x-forwarded-for': '203.0.113.9' } })
    expect((await proxy(dashboard)).status).not.toBe(503)
  })
})
