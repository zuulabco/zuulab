import { describe, expect, it } from 'vitest'
import { firebaseHostedDomain, resolveAuthDomain } from '@/lib/firebase-auth-domain'

const FALLBACK = 'zuulab-1c82c.firebaseapp.com'

describe('resolveAuthDomain', () => {
  it('uses the shop’s own address on the storefront', () => {
    expect(resolveAuthDomain(FALLBACK, 'www.zuulab.com', 'https://www.zuulab.com')).toBe('www.zuulab.com')
    expect(resolveAuthDomain(FALLBACK, 'WWW.ZUULAB.COM', 'https://www.zuulab.com/')).toBe('www.zuulab.com')
  })

  it('keeps Firebase’s address everywhere else: admin subdomain, apex, localhost, previews, server', () => {
    for (const host of ['dashboard.zuulab.com', 'zuulab.com', 'localhost', 'zuulab-git-x.vercel.app', undefined]) {
      expect(resolveAuthDomain(FALLBACK, host, 'https://www.zuulab.com'), String(host)).toBe(FALLBACK)
    }
  })

  it('never switches when the site address is local or unparseable', () => {
    expect(resolveAuthDomain(FALLBACK, 'localhost', 'http://localhost:3000')).toBe(FALLBACK)
    expect(resolveAuthDomain(FALLBACK, 'x', 'not a url')).toBe(FALLBACK)
  })
})

describe('firebaseHostedDomain', () => {
  it('prefers the configured Firebase address, else derives it from the project id', () => {
    expect(firebaseHostedDomain('zuulab-1c82c.firebaseapp.com', 'zuulab-1c82c')).toBe('zuulab-1c82c.firebaseapp.com')
    expect(firebaseHostedDomain('www.zuulab.com', 'zuulab-1c82c')).toBe('zuulab-1c82c.firebaseapp.com')
    expect(firebaseHostedDomain(undefined, 'Zuulab-1c82c')).toBe('zuulab-1c82c.firebaseapp.com')
  })

  it('is null without a usable project', () => {
    expect(firebaseHostedDomain(undefined, undefined)).toBeNull()
    expect(firebaseHostedDomain('', 'x/../y')).toBeNull()
  })
})
