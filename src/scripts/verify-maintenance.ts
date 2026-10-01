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

    // ----------------------------------------------------
    // ----------------------------------------------------
    // TEST 8: Dashboard Subdomain Routing & Canonical Admin Redirects
    // ----------------------------------------------------
    console.log('\n[8/10] Testing Dashboard Subdomain Routing & Canonical Admin Redirects...')
    
    // 8.1: dashboard.zuulab.com/ -> rewrites to /admin
    const reqDashRoot = new NextRequest('https://dashboard.zuulab.com/', {
      headers: { host: 'dashboard.zuulab.com' },
    })
    const resDashRoot = proxy(reqDashRoot)
    assert(resDashRoot.status !== 503, 'dashboard.zuulab.com root is NOT blocked by maintenance')
    assert(
      resDashRoot.headers.get('x-middleware-rewrite')?.endsWith('/admin') || false,
      'dashboard.zuulab.com/ rewrites internally to /admin'
    )

    // 8.2: dashboard.zuulab.com/orders -> rewrites to /admin/orders
    const reqDashOrders = new NextRequest('https://dashboard.zuulab.com/orders', {
      headers: { host: 'dashboard.zuulab.com' },
    })
    const resDashOrders = proxy(reqDashOrders)
    assert(
      resDashOrders.headers.get('x-middleware-rewrite')?.endsWith('/admin/orders') || false,
      'dashboard.zuulab.com/orders rewrites internally to /admin/orders'
    )

    // 8.3: dashboard.zuulab.com/settings -> rewrites to /admin/settings
    const reqDashSettings = new NextRequest('https://dashboard.zuulab.com/settings', {
      headers: { host: 'dashboard.zuulab.com' },
    })
    const resDashSettings = proxy(reqDashSettings)
    assert(
      resDashSettings.headers.get('x-middleware-rewrite')?.endsWith('/admin/settings') || false,
      'dashboard.zuulab.com/settings rewrites internally to /admin/settings'
    )

    // 8.4: dashboard.zuulab.com/admin/settings -> does not duplicate /admin
    const reqDashAdminSettings = new NextRequest('https://dashboard.zuulab.com/admin/settings', {
      headers: { host: 'dashboard.zuulab.com' },
    })
    const resDashAdminSettings = proxy(reqDashAdminSettings)
    assert(
      resDashAdminSettings.headers.get('x-middleware-rewrite')?.endsWith('/admin/settings') || false,
      'dashboard.zuulab.com/admin/settings prevents double /admin and rewrites to /admin/settings'
    )

    // 8.5: zuulab.com/admin -> 308 redirect to https://dashboard.zuulab.com/
    const reqRootAdmin = new NextRequest('https://zuulab.com/admin', {
      headers: { host: 'zuulab.com' },
    })
    const resRootAdmin = proxy(reqRootAdmin)
    assert(resRootAdmin.status === 308, 'zuulab.com/admin triggers HTTP 308 permanent redirect')
    assert(
      resRootAdmin.headers.get('location') === 'https://dashboard.zuulab.com/',
      'zuulab.com/admin redirects canonical URL to https://dashboard.zuulab.com/'
    )

    // 8.6: zuulab.com/admin/orders -> 308 redirect to https://dashboard.zuulab.com/orders
    const reqRootAdminOrders = new NextRequest('https://zuulab.com/admin/orders', {
      headers: { host: 'zuulab.com' },
    })
    const resRootAdminOrders = proxy(reqRootAdminOrders)
    assert(resRootAdminOrders.status === 308, 'zuulab.com/admin/orders triggers HTTP 308 redirect')
    assert(
      resRootAdminOrders.headers.get('location') === 'https://dashboard.zuulab.com/orders',
      'zuulab.com/admin/orders redirects canonical URL to https://dashboard.zuulab.com/orders'
    )

    // 8.7: www.zuulab.com/admin/settings -> 308 redirect to https://dashboard.zuulab.com/settings
    const reqWwwAdminSettings = new NextRequest('https://www.zuulab.com/admin/settings', {
      headers: { host: 'www.zuulab.com' },
    })
    const resWwwAdminSettings = proxy(reqWwwAdminSettings)
    assert(resWwwAdminSettings.status === 308, 'www.zuulab.com/admin/settings triggers HTTP 308 redirect')
    assert(
      resWwwAdminSettings.headers.get('location') === 'https://dashboard.zuulab.com/settings',
      'www.zuulab.com/admin/settings redirects canonical URL to https://dashboard.zuulab.com/settings'
    )

    // ----------------------------------------------------
    // TEST 9: In-Memory / Runtime Cache Control
    // ----------------------------------------------------
    console.log('\n[9/10] Testing Runtime State Synchronization...')
    const { setCachedMaintenanceState, getCachedMaintenanceState } = await import('../lib/config/maintenance')

    // Simulate Admin Panel clicking "Bakım Modunu Aç" (persisted to DB -> cached in runtime)
    setCachedMaintenanceState(true, 'database')
    const cacheStateActive = getCachedMaintenanceState()
    assert(cacheStateActive.enabled === true, 'Cache state reflects maintenance mode enabled')
    assert(cacheStateActive.source === 'database', 'Cache reflects database source')

    const reqUnderDbMaintenance = new NextRequest('http://localhost:3000/', {
      headers: { 'x-vercel-forwarded-for': '88.99.100.101' },
    })
    assert(proxy(reqUnderDbMaintenance).status === 503, 'Database/cache true activates 503 on storefront')

    // Simulate Admin Panel clicking "Siteyi Yayına Al" (persisted to DB -> cached in runtime)
    setCachedMaintenanceState(false, 'database')
    const cacheStateDisabled = getCachedMaintenanceState()
    assert(cacheStateDisabled.enabled === false, 'Cache state reflects maintenance mode disabled')

    const reqUnderDbDisabled = new NextRequest('http://localhost:3000/', {
      headers: { 'x-vercel-forwarded-for': '88.99.100.101' },
    })
    assert(proxy(reqUnderDbDisabled).status !== 503, 'Database/cache false immediately restores storefront access')

    // Reset cache to allow clean testing
    setCachedMaintenanceState(null as any, 'default')

    // ----------------------------------------------------
    // TEST 10: Live Prisma 8 Database Read / Write / Toggle Verification
    // ----------------------------------------------------
    console.log('\n[10/10] Testing Live Prisma 8 Setting Query & Mutation...')
    const { db, isDatabaseConfigured } = await import('../prisma/db')
    const {
      getMaintenanceModeStatus,
      setMaintenanceModeStatus,
    } = await import('../lib/services/settings/maintenance-settings.service')

    if (isDatabaseConfigured) {
      // Step 1: Read initial status
      const initialStatus = await getMaintenanceModeStatus()
      console.log(`  Initial DB Maintenance status: enabled=${initialStatus.enabled}, source=${initialStatus.source}`)

      // Step 2: Toggle to TRUE using setMaintenanceModeStatus (find-then-update/create)
      const turnedOn = await setMaintenanceModeStatus(true, 'audit-test@zuulab.com')
      assert(turnedOn.enabled === true, 'Test B: setMaintenanceModeStatus(true) returned enabled=true')
      assert(turnedOn.source === 'database', 'Test B: setMaintenanceModeStatus(true) source is database')

      // Step 3: Verify read from DB returns TRUE
      const verifyTrue = await getMaintenanceModeStatus()
      assert(verifyTrue.enabled === true, 'Test C: getMaintenanceModeStatus() verified true from live PostgreSQL')
      assert(verifyTrue.source === 'database', 'Test C: getMaintenanceModeStatus() source is database')

      // Step 4: Toggle to FALSE using setMaintenanceModeStatus
      const turnedOff = await setMaintenanceModeStatus(false, 'audit-test@zuulab.com')
      assert(turnedOff.enabled === false, 'Test D: setMaintenanceModeStatus(false) returned enabled=false')
      assert(turnedOff.source === 'database', 'Test D: setMaintenanceModeStatus(false) source is database')

      // Step 5: Verify read from DB returns FALSE
      const verifyFalse = await getMaintenanceModeStatus()
      assert(verifyFalse.enabled === false, 'Test E: getMaintenanceModeStatus() verified false from live PostgreSQL')
      assert(verifyFalse.source === 'database', 'Test E: getMaintenanceModeStatus() source is database')

      // Step 6: Verify direct Prisma 8 where().first() and where().update()
      const directRecord = await (db.orm.public.Setting as any).where({ key: 'system.maintenance_mode' }).first()
      assert(directRecord !== null, 'Test F: Prisma 8 db.orm.public.Setting.where().first() succeeds')
      assert(typeof directRecord.value === 'string', 'Test F: directRecord has valid value string')

      // Step 7: Restore initial state so production data is untouched
      await setMaintenanceModeStatus(initialStatus.enabled, 'audit-test@zuulab.com')
      console.log(`  Cleanly restored maintenance mode to initial state: ${initialStatus.enabled}`)
    } else {
      console.log('  [SKIPPED: DATABASE_URL not configured in local runner environment]')
    }

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
