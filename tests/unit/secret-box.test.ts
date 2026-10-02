import crypto from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { isSecretBoxConfigured, openSecret, sealSecret } from '@/lib/security/secret-box'

const original = process.env.MARKETPLACE_CREDENTIALS_KEY

afterEach(() => {
  process.env.MARKETPLACE_CREDENTIALS_KEY = original
})

describe('secret box (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', () => {
    process.env.MARKETPLACE_CREDENTIALS_KEY = crypto.randomBytes(32).toString('base64')
    const sealed = sealSecret('my-api-secret-ğüş')
    expect(sealed.startsWith('v1:')).toBe(true)
    expect(sealed).not.toContain('my-api-secret')
    expect(openSecret(sealed)).toBe('my-api-secret-ğüş')
  })

  it('uses a fresh IV, so equal secrets encrypt differently', () => {
    process.env.MARKETPLACE_CREDENTIALS_KEY = crypto.randomBytes(32).toString('hex')
    expect(sealSecret('same')).not.toBe(sealSecret('same'))
  })

  it('rejects tampered ciphertext and a different key', () => {
    process.env.MARKETPLACE_CREDENTIALS_KEY = crypto.randomBytes(32).toString('base64')
    const sealed = sealSecret('secret')
    const [v, iv, tag, ct] = sealed.split(':')
    const flipped = Buffer.from(ct, 'base64')
    flipped[0] ^= 1
    expect(() => openSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow()

    process.env.MARKETPLACE_CREDENTIALS_KEY = crypto.randomBytes(32).toString('base64')
    expect(() => openSecret(sealed)).toThrow()
  })

  it('refuses a missing or short key', () => {
    process.env.MARKETPLACE_CREDENTIALS_KEY = ''
    expect(isSecretBoxConfigured()).toBe(false)
    expect(() => sealSecret('x')).toThrow(/MARKETPLACE_CREDENTIALS_KEY/)
    process.env.MARKETPLACE_CREDENTIALS_KEY = Buffer.from('too-short').toString('base64')
    expect(() => sealSecret('x')).toThrow(/32/)
  })
})
