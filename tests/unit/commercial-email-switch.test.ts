import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMERCIAL_EMAIL_OFF_MESSAGE, commercialEmailEnabled } from '@/lib/email/policy'

afterEach(() => vi.unstubAllEnvs())

describe('master switch for commercial e-mail', () => {
  it('is off unless the variable is exactly "true" (any case, spaces ignored)', () => {
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', '')
    expect(commercialEmailEnabled()).toBe(false)
    for (const v of ['false', '0', '1', 'yes', 'on', 'enabled']) {
      vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', v)
      expect(commercialEmailEnabled()).toBe(false)
    }
    for (const v of ['true', 'TRUE', ' True ']) {
      vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', v)
      expect(commercialEmailEnabled()).toBe(true)
    }
  })

  it('is off when the variable is missing altogether', () => {
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', undefined as unknown as string)
    delete process.env.COMMERCIAL_EMAIL_ENABLED
    expect(commercialEmailEnabled()).toBe(false)
  })

  it('tells the admin why, and that order mails are not affected', () => {
    expect(COMMERCIAL_EMAIL_OFF_MESSAGE).toContain('İYS')
    expect(COMMERCIAL_EMAIL_OFF_MESSAGE).toContain('Sipariş ve kargo')
  })
})
