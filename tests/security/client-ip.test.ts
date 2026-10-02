import { afterEach, describe, expect, it } from 'vitest'
import { getClientIp } from '@/lib/config/maintenance'

afterEach(() => {
  delete process.env.TRUST_CLOUDFLARE_IP
})

describe('client IP', () => {
  it('ignores a cf-connecting-ip header a visitor sends (no Cloudflare in front)', () => {
    const headers = new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '203.0.113.7' })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('uses the edge-set headers in order, first address of a chain', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2')
    expect(getClientIp(new Headers({ 'x-vercel-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9')
    expect(getClientIp(new Headers())).toBe('127.0.0.1')
  })

  it('trusts Cloudflare only when explicitly configured', () => {
    process.env.TRUST_CLOUDFLARE_IP = '1'
    expect(getClientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '203.0.113.7' }))).toBe('1.2.3.4')
  })
})
