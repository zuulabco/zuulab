import crypto from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCarrierWebhook } from '@/lib/services/shipping/webhook-signature'
import {
  createOrderAccessToken,
  createSessionToken,
  hasOrderAccess,
  ORDER_ACCESS_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/services/session.service'

afterEach(() => vi.unstubAllEnvs())

describe('carrier webhook verification', () => {
  const body = JSON.stringify({ trackingNumber: 'SRT1', status: 'DELIVERED' })
  const sign = (secret: string) => crypto.createHmac('sha256', secret).update(body).digest('hex')

  it('requires a matching HMAC in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SHIPPING_WEBHOOK_SECRET', 's3cret')
    expect(verifyCarrierWebhook({ provider: 'SURAT', rawBody: body, signature: sign('s3cret') }).ok).toBe(true)
    expect(verifyCarrierWebhook({ provider: 'SURAT', rawBody: body, signature: `sha256=${sign('s3cret')}` }).ok).toBe(true)
    expect(verifyCarrierWebhook({ provider: 'SURAT', rawBody: body, signature: 'sig_s3cret' }).ok).toBe(false)
    expect(verifyCarrierWebhook({ provider: 'SURAT', rawBody: body }).ok).toBe(false)
  })

  it('rejects MOCK and unconfigured secrets in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SHIPPING_WEBHOOK_SECRET', '')
    expect(verifyCarrierWebhook({ provider: 'SURAT', rawBody: body, signature: 'x' }).ok).toBe(false)
    vi.stubEnv('SHIPPING_WEBHOOK_SECRET', 's3cret')
    expect(verifyCarrierWebhook({ provider: 'MOCK', rawBody: body, signature: sign('s3cret') }).ok).toBe(false)
  })
})

describe('order access token', () => {
  const requestWith = (cookie: string) => new Request('http://x', { headers: { cookie } })

  it('grants access only to the order it was issued for', () => {
    vi.stubEnv('AUTH_SESSION_SECRET', 'test-secret')
    const token = createOrderAccessToken('ZUU100')
    const req = requestWith(`${ORDER_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`)
    expect(hasOrderAccess(req, 'ZUU100')).toBe(true)
    expect(hasOrderAccess(req, 'ZUU101')).toBe(false)
    expect(hasOrderAccess(requestWith(''), 'ZUU100')).toBe(false)
  })

  it('cannot be replayed as a login session', () => {
    vi.stubEnv('AUTH_SESSION_SECRET', 'test-secret')
    expect(verifySessionToken(createOrderAccessToken('ZUU100'))).toBeNull()
    expect(verifySessionToken(createSessionToken({ userId: 'u1', email: 'a@b.com' }))).not.toBeNull()
  })

  it('has no hardcoded session secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SESSION_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '')
    vi.stubEnv('FIREBASE_ADMIN_PRIVATE_KEY', '')
    expect(() => createSessionToken({ userId: 'u1', email: 'a@b.com' })).toThrow(/AUTH_SESSION_SECRET/)
  })
})
