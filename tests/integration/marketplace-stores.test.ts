/**
 * Marketplace stores and encrypted credentials against the real database.
 * Marketplace HTTP calls are stubbed; stores created here use run-tagged seller ids
 * and are removed in afterAll.
 */
import 'dotenv/config'
import crypto from 'crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

process.env.MARKETPLACE_CREDENTIALS_KEY ||= crypto.randomBytes(32).toString('base64')

const { db } = await import('@/prisma/db')
const mkt = await import('@/lib/services/marketplace/marketplace.service')

const RUN = `itmkt${Date.now().toString(36)}`
const ADMIN = 'test-admin'
const created: string[] = []

beforeAll(() => {
  expect(process.env.MARKETPLACE_CREDENTIALS_KEY).toBeTruthy()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  for (const id of created) {
    await db.runtime().execute(db.raw.sql`DELETE FROM marketplace_stores WHERE id = ${id}`.affectedCount().build())
  }
})

async function createTrendyol(suffix: string, keys = true) {
  const store = await mkt.createMarketplaceStore(
    {
      provider: 'TRENDYOL',
      name: `Test TY ${suffix}`,
      externalMerchantId: `${RUN}${suffix}`,
      environment: 'PRODUCTION',
      ...(keys ? { apiKey: 'ty-key-ABCD1234', apiSecret: 'ty-secret-value' } : {}),
      priceMarkupPercent: 12.5,
    },
    ADMIN
  )
  created.push(store.id)
  return store
}

describe('marketplace stores', () => {
  it('stores credentials encrypted and exposes only a hint', async () => {
    const store = await createTrendyol('a')
    expect(store.hasCredentials).toBe(true)
    expect(store.credentialHint).toBe('••••1234')
    expect(store.priceMarkupPercent).toBe(12.5)
    expect(store.stockSyncEnabled).toBe(false)
    expect(store.priceSyncEnabled).toBe(false)
    expect(JSON.stringify(store)).not.toContain('ty-secret-value')

    const row = await db.orm.public.MarketplaceCredential.where({ storeId: store.id }).first()
    expect(row!.apiKeyEncrypted).not.toContain('ty-key')
    expect(row!.apiSecretEncrypted).not.toContain('ty-secret')

    const cred = await mkt.getStoreCredentialById(store.id)
    expect(cred!.apiKey).toBe('ty-key-ABCD1234')
    expect(cred!.apiSecret).toBe('ty-secret-value')

    const listed = (await mkt.getMarketplaceStores()).find((s) => s.id === store.id)
    expect(listed?.credentialHint).toBe('••••1234')
  })

  it('rejects a duplicate seller id in the same environment', async () => {
    await createTrendyol('dup', false)
    await expect(
      mkt.createMarketplaceStore(
        { provider: 'TRENDYOL', name: 'x', externalMerchantId: `${RUN}dup`, environment: 'PRODUCTION' },
        ADMIN
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('updates switches and markup, validates the markup range', async () => {
    const store = await createTrendyol('upd', false)
    const updated = await mkt.updateMarketplaceStore(
      store.id,
      { stockSyncEnabled: true, priceMarkupPercent: 20, status: 'INACTIVE' },
      ADMIN
    )
    expect(updated.stockSyncEnabled).toBe(true)
    expect(updated.priceMarkupPercent).toBe(20)
    expect(updated.status).toBe('INACTIVE')
    await expect(mkt.updateMarketplaceStore(store.id, { priceMarkupPercent: 150 }, ADMIN)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('rotating keys bumps the version and replaces the secret', async () => {
    const store = await createTrendyol('rot')
    const { version } = await mkt.rotateStoreCredentials(store.id, { apiKey: 'new-key-9999', apiSecret: 'new-secret' }, ADMIN)
    expect(version).toBe(2)
    const cred = await mkt.getStoreCredentialById(store.id)
    expect(cred!.apiSecret).toBe('new-secret')
    expect((await mkt.getMarketplaceStoreById(store.id))!.credentialHint).toBe('••••9999')
  })

  it('connection test calls Trendyol with Basic auth and the SelfIntegration User-Agent', async () => {
    const store = await createTrendyol('conn')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ totalElements: 7 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await mkt.testStoreConnection(store.id, ADMIN)
    expect(result.success).toBe(true)
    expect(result.details?.approvedProductCount).toBe(7)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `https://apigw.trendyol.com/integration/product/sellers/${RUN}conn/products/approved?page=0&size=1`
    )
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toBe(`${RUN}conn - SelfIntegration`)
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('ty-key-ABCD1234:ty-secret-value').toString('base64')}`)

    const after = (await mkt.getMarketplaceStoreById(store.id))!
    expect(after.lastConnectionCheck).not.toBeNull()
    expect(after.lastError).toBeNull()
  })

  it('reports rejected keys and records the error on the store', async () => {
    const store = await createTrendyol('bad')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"unauthorized"}', { status: 401 })))
    const result = await mkt.testStoreConnection(store.id, ADMIN)
    expect(result.success).toBe(false)
    expect(result.code).toBe('INVALID_CREDENTIALS')
    expect((await mkt.getMarketplaceStoreById(store.id))!.lastError).toMatch(/401/)
  })

  it('Hepsiburada test uses the listing API and never fakes success without keys', async () => {
    const store = await mkt.createMarketplaceStore(
      { provider: 'HEPSIBURADA', name: 'Test HB', externalMerchantId: `${RUN}hb`, environment: 'PRODUCTION' },
      ADMIN
    )
    created.push(store.id)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const noKeys = await mkt.testStoreConnection(store.id, ADMIN)
    expect(noKeys).toMatchObject({ success: false, code: 'NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()

    await mkt.rotateStoreCredentials(store.id, { apiKey: 'hb-user', apiSecret: 'hb-pass' }, ADMIN)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ totalCount: 3 }), { status: 200 }))
    const ok = await mkt.testStoreConnection(store.id, ADMIN)
    expect(ok.success).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://listing-external.hepsiburada.com/listings/merchantid/${RUN}hb?offset=0&limit=1`
    )
  })

  it('deleting a store removes its credentials', async () => {
    const store = await createTrendyol('del')
    await mkt.deleteMarketplaceStore(store.id, ADMIN)
    expect(await mkt.getMarketplaceStoreById(store.id)).toBeNull()
    expect(await db.orm.public.MarketplaceCredential.where({ storeId: store.id }).first()).toBeNull()
  })
})
