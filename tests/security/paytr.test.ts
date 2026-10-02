import crypto from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PayTRPaymentProvider } from '@/lib/services/payment/paytr.provider'

const LIVE = { PAYTR_MERCHANT_ID: '123456', PAYTR_MERCHANT_KEY: 'live-key', PAYTR_MERCHANT_SALT: 'live-salt' }

function stubEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
}

function paytrHash(oid: string, status: string, amount: string, key: string, salt: string) {
  return crypto.createHmac('sha256', key).update(`${oid}${salt}${status}${amount}`).digest('base64')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('PayTR callback verification', () => {
  it('accepts only the genuine PayTR HMAC when live credentials are configured', async () => {
    stubEnv({ ...LIVE, NODE_ENV: 'production' })
    const provider = new PayTRPaymentProvider()
    const payload = { merchant_oid: 'ZUU1', status: 'success', total_amount: '10000' }

    const good = await provider.verifyWebhook({ ...payload, hash: paytrHash('ZUU1', 'success', '10000', 'live-key', 'live-salt') })
    expect(good.isValid).toBe(true)

    const forged = await provider.verifyWebhook({ ...payload, hash: 'test-signature' })
    expect(forged.isValid).toBe(false)

    const unsigned = await provider.verifyWebhook(payload)
    expect(unsigned.isValid).toBe(false)
  })

  it('rejects simulator signatures in development when live credentials exist', async () => {
    stubEnv({ ...LIVE, NODE_ENV: 'development' })
    const provider = new PayTRPaymentProvider()
    const result = await provider.verifyWebhook({ merchant_oid: 'ZUU1', status: 'success', total_amount: '10000', hash: 'test-signature' })
    expect(result.isValid).toBe(false)
  })

  it('rejects everything in production without credentials', async () => {
    stubEnv({ PAYTR_MERCHANT_ID: '', PAYTR_MERCHANT_KEY: '', PAYTR_MERCHANT_SALT: '', NODE_ENV: 'production' })
    const provider = new PayTRPaymentProvider()
    const result = await provider.verifyWebhook({ merchant_oid: 'ZUU1', status: 'success', total_amount: '10000' })
    expect(result.isValid).toBe(false)
  })
})

describe('PayTR simulator', () => {
  it('refuses to sign test callbacks with real merchant secrets', () => {
    stubEnv({ ...LIVE, NODE_ENV: 'development' })
    const provider = new PayTRPaymentProvider()
    expect(() => provider.generateTestWebhook('ZUU1', 100, 'SUCCESS')).toThrow(/SIMULATION_DISABLED/)
  })

  it('works locally without credentials and its signature verifies', async () => {
    stubEnv({ PAYTR_MERCHANT_ID: '', PAYTR_MERCHANT_KEY: '', PAYTR_MERCHANT_SALT: '', NODE_ENV: 'development' })
    const provider = new PayTRPaymentProvider()
    const { payload, signature } = provider.generateTestWebhook('ZUU1', 100, 'SUCCESS')
    const result = await provider.verifyWebhook(payload, signature)
    expect(result.isValid).toBe(true)
  })

  it('does not fall back to a fake session when PayTR rejects the token request', async () => {
    stubEnv({ ...LIVE, NODE_ENV: 'production' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'failed', reason: 'invalid hash' }))
    )
    const provider = new PayTRPaymentProvider()
    await expect(
      provider.createSession({
        orderNumber: 'ZUU1',
        amount: 100,
        currency: 'TRY',
        customer: { fullName: 'A B', email: 'a@b.com', phone: '5550000000', ip: '1.2.3.4' },
        items: [{ name: 'X', price: 100, quantity: 1 }],
      } as Parameters<PayTRPaymentProvider["createSession"]>[0])
    ).rejects.toThrow(/PAYTR_TOKEN_ERROR/)
  })
})
