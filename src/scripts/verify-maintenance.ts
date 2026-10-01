/**
 * Comprehensive Automated Verification Suite for Maintenance Mode (Next.js 16)
 *
 * Verifies:
 * 1. Environment parsing (MAINTENANCE_MODE boolean resolution)
 * 2. IP parsing, cleaning, port-stripping, and IPv4-mapped IPv6 normalization
 * 3. Client IP header extraction priority (x-vercel-ip > cf-connecting-ip > x-real-ip > x-forwarded-for)
 * 4. IP Allowlist evaluation and localhost alias equivalence
 * 5. Proxy route interception logic:
 *    - Storefront blocked with HTTP 503 when maintenance=true and IP not allowlisted
 *    - Storefront allowed (HTTP 200/next) when maintenance=true and IP allowlisted
 *    - Storefront allowed when maintenance=false
 * 6. Non-storefront route exemptions (MUST NEVER BE BLOCKED):
 *    - /admin and /admin/*
 *    - /api/payments/webhook (PayTR webhook)
 *    - /api/checkout/*
 *    - /api/health and /api/health/liveness
 *    - /api/cron/*
 *    - Static assets (/_next/*, /favicon.ico, /robots.txt, /sitemap.xml)
 * 7. HTML response headers & content:
 *    - 503 status code
 *    - Retry-After: 3600
 *    - Cache-Control: no-store
 *    - ZUULAB brand signature and editorial text
 */

import { NextRequest } from 'next/server'
import {
  normalizeIp,
  getClientIp,
  isIpAllowed,
  getMaintenanceHtml,
} from '../lib/config/maintenance'
import { proxy } from '../proxy'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✓ PASS: ${message}`)
}

async function runTests() {
  console.log('====================================================')
  console.log('ZUULAB MAINTENANCE MODE VERIFICATION SUITE')
  console.log('====================================================\n')

  const originalEnv = { ...process.env }

  try {
    // ----------------------------------------------------
    // TEST 1: IP Normalization
    // ----------------------------------------------------
    console.log('[1/7] Testing IP Normalization...')
    assert(normalizeIp('192.168.1.1') === '192.168.1.1', 'Standard IPv4 trimmed')
    assert(normalizeIp('  203.0.113.50  ') === '203.0.113.50', 'Trims whitespace')
    assert(normalizeIp('::ffff:192.168.1.10') === '192.168.1.10', 'Strips ::ffff: IPv4-mapped IPv6 prefix')
    assert(normalizeIp('192.168.1.1:8080') === '192.168.1.1', 'Strips port from IPv4')
    assert(normalizeIp('[2001:db8::1]:443') === '2001:db8::1', 'Strips port from bracketed IPv6')
    assert(normalizeIp('::1') === '::1', 'IPv6 localhost preserved')
    assert(normalizeIp('') === '', 'Empty string handled')

    // ----------------------------------------------------
    // TEST 2: Client IP Extraction Priority
    // ----------------------------------------------------
    console.log('\n[2/7] Testing Client IP Header Resolution...')
    
    // Priority 1: x-vercel-forwarded-for (single or chained)
    const h1 = new Headers({
      'x-vercel-forwarded-for': '198.51.100.1, 10.0.0.1',
      'cf-connecting-ip': '198.51.100.2',
      'x-real-ip': '198.51.100.3',
      'x-forwarded-for': '198.51.100.4, 10.0.0.1',
    })
    assert(getClientIp(h1) === '198.51.100.1', 'x-vercel-forwarded-for takes highest precedence and extracts first IP')

    // Priority 2: cf-connecting-ip (when x-vercel-forwarded-for is missing)
    const h2 = new Headers({
      'cf-connecting-ip': '198.51.100.2',
      'x-real-ip': '198.51.100.3',
      'x-forwarded-for': '198.51.100.4, 10.0.0.1',
    })
    assert(getClientIp(h2) === '198.51.100.2', 'cf-connecting-ip takes second precedence')

    // Priority 3: x-real-ip
    const h3 = new Headers({
      'x-real-ip': '198.51.100.3',
      'x-forwarded-for': '198.51.100.4, 10.0.0.1',
    })
    assert(getClientIp(h3) === '198.51.100.3', 'x-real-ip takes third precedence')

    // Priority 4: x-forwarded-for leftmost IP
    const h4 = new Headers({
      'x-forwarded-for': '198.51.100.4, 10.0.0.1, 172.16.0.1',
    })
    assert(getClientIp(h4) === '198.51.100.4', 'x-forwarded-for first IP resolved')

    // Fallback
    const h5 = new Headers({})
    assert(getClientIp(h5) === '127.0.0.1', 'Fallback to 127.0.0.1 when no headers present')

    // ----------------------------------------------------
    // TEST 3: IP Allowlist Matching
    // ----------------------------------------------------
    console.log('\n[3/7] Testing IP Allowlist Matching...')
    const allowedList = ['203.0.113.195', '198.51.100.1', '127.0.0.1']

    assert(isIpAllowed('203.0.113.195', allowedList), 'Matches exact IPv4')
    assert(isIpAllowed('::ffff:203.0.113.195', allowedList), 'Matches IPv4-mapped IPv6 to list IPv4')
    assert(isIpAllowed('::1', allowedList), 'Matches IPv6 loopback (::1) to 127.0.0.1')
    assert(isIpAllowed('127.0.0.1', ['::1']), 'Matches 127.0.0.1 to ::1 in list')
    assert(!isIpAllowed('192.0.2.1', allowedList), 'Rejects non-allowlisted IP')
    assert(!isIpAllowed('192.0.2.1', []), 'Rejects all when list is empty')

    // ----------------------------------------------------
    // TEST 4: Maintenance HTML & Header Specification
    // ----------------------------------------------------
    console.log('\n[4/7] Testing Maintenance HTML Specification...')
    const html = getMaintenanceHtml()
    assert(html.includes('ZUULAB şu anda yapım aşamasında.'), 'Contains required primary message')
    assert(html.includes('Yeni deneyimimizi hazırlıyoruz. Çok yakında tekrar buradayız.'), 'Contains secondary description')
    assert(html.includes('zuulab'), 'Contains ZUULAB brand signature')
    assert(html.includes('#0080C4') || html.includes('--zuu-blue'), 'Contains brand blue color')
    assert(html.includes('#FEC80F') || html.includes('--zuu-yellow'), 'Contains brand yellow color')
    assert(html.includes('noindex, nofollow'), 'Contains robots noindex tag')
    assert(html.includes('destek@zuulab.com'), 'Contains support email')

    // ----------------------------------------------------
    // TEST 5: Proxy Behavior with MAINTENANCE_MODE=false
    // ----------------------------------------------------
    console.log('\n[5/7] Testing Proxy when MAINTENANCE_MODE=false...')
    process.env.MAINTENANCE_MODE = 'false'
    process.env.MAINTENANCE_ALLOWED_IPS = '203.0.113.195'

    const reqHomeDisabled = new NextRequest('http://localhost:3000/', {
      headers: { 'x-real-ip': '1.2.3.4' }, // non-allowed IP
    })
    const resHomeDisabled = proxy(reqHomeDisabled)
    assert(resHomeDisabled.status !== 503, 'Public homepage passes through when maintenance is disabled')

    // ----------------------------------------------------
    // TEST 6: Proxy Behavior with MAINTENANCE_MODE=true
    // ----------------------------------------------------
    console.log('\n[6/7] Testing Proxy when MAINTENANCE_MODE=true...')
    process.env.MAINTENANCE_MODE = 'true'
    process.env.MAINTENANCE_ALLOWED_IPS = '203.0.113.195,198.51.100.1'

    // Scenario A: Non-allowlisted IP visits storefront root (/)
    const reqNonAllowedHome = new NextRequest('http://localhost:3000/', {
      headers: { 'x-vercel-forwarded-for': '88.99.100.101' },
    })
    const resNonAllowedHome = proxy(reqNonAllowedHome)
    assert(resNonAllowedHome.status === 503, 'Non-allowed IP receives HTTP 503 on storefront root')
    assert(resNonAllowedHome.headers.get('content-type')?.includes('text/html') ?? false, 'Returns HTML content-type')
    assert(resNonAllowedHome.headers.get('retry-after') === '3600', 'Contains Retry-After: 3600')
    assert(resNonAllowedHome.headers.get('cache-control')?.includes('no-store') ?? false, 'Contains Cache-Control: no-store')
    assert(resNonAllowedHome.headers.get('x-maintenance-mode') === 'active', 'Contains X-Maintenance-Mode header')

    // Scenario B: Non-allowlisted IP visits product page (/urun/minimal-lamba)
    const reqProduct = new NextRequest('http://localhost:3000/urun/minimal-lamba', {
      headers: { 'x-vercel-forwarded-for': '88.99.100.101' },
    })
    const resProduct = proxy(reqProduct)
    assert(resProduct.status === 503, 'Product page returns HTTP 503 under maintenance')

    // Scenario C: Non-allowlisted IP visits cart (/sepet)
    const reqCart = new NextRequest('http://localhost:3000/sepet', {
      headers: { 'x-vercel-forwarded-for': '88.99.100.101' },
    })
    const resCart = proxy(reqCart)
    assert(resCart.status === 503, 'Cart page returns HTTP 503 under maintenance')

    // Scenario D: Allowlisted IP visits storefront (MAINTENANCE BYPASS)
    const reqAllowedHome = new NextRequest('http://localhost:3000/', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.195' },
    })
    const resAllowedHome = proxy(reqAllowedHome)
    assert(resAllowedHome.status !== 503, 'Allowlisted IP successfully bypasses maintenance on storefront')
    assert(resAllowedHome.headers.get('x-maintenance-bypass') === 'allowed-ip', 'Bypass header set for developer tracking')

    // ----------------------------------------------------
    // TEST 7: Critical Route Exemptions (NEVER BLOCKED)
    // ----------------------------------------------------
    console.log('\n[7/7] Testing Critical Route Exemptions (Admin, APIs, Webhooks, Crons)...')
    // Maintenance is still ACTIVE and IP is UNKNOWN/NON-ALLOWED
    const nonAllowedHeaders = { 'x-vercel-forwarded-for': '88.99.100.101' }

    // 1. PayTR Webhook
    const reqPaytrWebhook = new NextRequest('http://localhost:3000/api/payments/webhook', {
      headers: nonAllowedHeaders,
    })
    const resPaytrWebhook = proxy(reqPaytrWebhook)
    assert(resPaytrWebhook.status !== 503, 'CRITICAL: PayTR webhook is NEVER blocked by maintenance')

    // 2. Health checks
    const reqHealth = new NextRequest('http://localhost:3000/api/health/liveness', {
      headers: nonAllowedHeaders,
    })
    const resHealth = proxy(reqHealth)
    assert(resHealth.status !== 503, 'CRITICAL: /api/health/liveness is NEVER blocked')

    // 3. Checkout initiate API
    const reqCheckout = new NextRequest('http://localhost:3000/api/checkout/initiate', {
      headers: nonAllowedHeaders,
    })
    const resCheckout = proxy(reqCheckout)
    assert(resCheckout.status !== 503, 'CRITICAL: /api/checkout/initiate is NEVER blocked')

    // 4. Admin Dashboard
    const reqAdmin = new NextRequest('http://localhost:3000/admin', {
      headers: nonAllowedHeaders,
    })
    const resAdmin = proxy(reqAdmin)
    assert(resAdmin.status !== 503, 'CRITICAL: /admin is NEVER blocked by maintenance')

    const reqAdminOrders = new NextRequest('http://localhost:3000/admin/orders', {
      headers: nonAllowedHeaders,
    })
    const resAdminOrders = proxy(reqAdminOrders)
    assert(resAdminOrders.status !== 503, 'CRITICAL: /admin/orders is NEVER blocked')

    // 5. Cron API
    const reqCron = new NextRequest('http://localhost:3000/api/cron/payment-expiration', {
      headers: nonAllowedHeaders,
    })
    const resCron = proxy(reqCron)
    assert(resCron.status !== 503, 'CRITICAL: /api/cron/* is NEVER blocked')

    // 6. Next.js Static Chunks
    const reqStatic = new NextRequest('http://localhost:3000/_next/static/chunks/main.js', {
      headers: nonAllowedHeaders,
    })
    const resStatic = proxy(reqStatic)
    assert(resStatic.status !== 503, 'Next.js static assets are NEVER blocked')

    // 7. Metadata Files
    const reqFavicon = new NextRequest('http://localhost:3000/favicon.ico', {
      headers: nonAllowedHeaders,
    })
    assert(proxy(reqFavicon).status !== 503, 'favicon.ico is NEVER blocked')

    const reqRobots = new NextRequest('http://localhost:3000/robots.txt', {
      headers: nonAllowedHeaders,
    })
    assert(proxy(reqRobots).status !== 503, 'robots.txt is NEVER blocked')

    const reqSitemap = new NextRequest('http://localhost:3000/sitemap.xml', {
      headers: nonAllowedHeaders,
    })
    assert(proxy(reqSitemap).status !== 503, 'sitemap.xml is NEVER blocked')

    console.log('\n====================================================')
    console.log('ALL MAINTENANCE MODE TESTS PASSED SUCCESSFULLY! (100%)')
    console.log('====================================================')
  } finally {
    // Restore environment
    process.env = originalEnv
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
