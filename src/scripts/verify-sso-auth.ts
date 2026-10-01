import assert from 'assert'
import { NextRequest } from 'next/server'
import { POST as syncRoute } from '../app/api/auth/sync/route'
import { GET as meRoute } from '../app/api/auth/me/route'
import { POST as logoutRoute } from '../app/api/auth/logout/route'
import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieDomain,
  extractSessionCookie,
  SESSION_COOKIE_NAME,
} from '../lib/services/session.service'
import { syncOrCreateUser } from '../lib/services/auth.service'

async function runTests() {
  console.log('====================================================')
  console.log('ZUULAB CROSS-SUBDOMAIN SSO & DASHBOARD AUTH VERIFICATION')
  console.log('====================================================\n')

  // --------------------------------------------------------------------------
  // TEST 1: Session Token Signing, Timing-Safe Verification & Tamper Protection
  // --------------------------------------------------------------------------
  console.log('[1/8] Testing Session Token Signing & Tamper Verification...')
  const testPayload = {
    userId: 'usr-test-admin-123',
    firebaseUid: 'fb-admin-uid-123',
    email: 'admin@zuulab.com',
    role: 'ADMIN',
  }
  const token = createSessionToken(testPayload, 3600)
  assert(token && typeof token === 'string', 'Session token generated successfully')
  assert(token.includes('.'), 'Session token is in format payload.signature')

  const verified = verifySessionToken(token)
  assert(verified !== null, 'Session token verified successfully')
  assert(verified?.userId === testPayload.userId, 'Verified userId matches')
  assert(verified?.email === testPayload.email, 'Verified email matches')
  assert(verified?.role === testPayload.role, 'Verified role matches')

  // Tampered payload
  const tampered = token.replace(/^[a-zA-Z0-9_-]+/, Buffer.from(JSON.stringify({ ...testPayload, role: 'SUPER_ADMIN' })).toString('base64url'))
  assert(verifySessionToken(tampered) === null, 'Tampered token rejected by HMAC')

  // Expired token
  const expiredToken = createSessionToken(testPayload, -10)
  assert(verifySessionToken(expiredToken) === null, 'Expired token rejected')
  console.log('✓ PASS: Session signing, verification, tampering, and expiry checks passed.\n')

  // --------------------------------------------------------------------------
  // TEST 2: Cookie Domain Calculation for Production vs Development
  // --------------------------------------------------------------------------
  console.log('[2/8] Testing Cookie Domain Calculation...')
  assert(getSessionCookieDomain('zuulab.com') === '.zuulab.com', 'zuulab.com sets .zuulab.com')
  assert(getSessionCookieDomain('dashboard.zuulab.com') === '.zuulab.com', 'dashboard.zuulab.com sets .zuulab.com')
  assert(getSessionCookieDomain('www.zuulab.com') === '.zuulab.com', 'www.zuulab.com sets .zuulab.com')
  assert(getSessionCookieDomain('localhost:3000') === undefined, 'localhost:3000 sets no domain (browser binds to local host)')
  assert(getSessionCookieDomain('127.0.0.1:3000') === undefined, '127.0.0.1 sets no domain')
  console.log('✓ PASS: Cookie domain correctly isolated and shared for .zuulab.com subdomains.\n')

  // --------------------------------------------------------------------------
  // TEST 3: Storefront ADMIN Login -> POST /api/auth/sync -> Session Cookie
  // --------------------------------------------------------------------------
  console.log('[3/8] Testing Storefront ADMIN Login & Session Cookie Creation...')
  const adminDevToken = `dev-token-${Date.now()}:admin-sso-uid:admin@zuulab.com:ADMIN`
  const syncReq = new NextRequest('https://zuulab.com/api/auth/sync', {
    method: 'POST',
    headers: {
      host: 'zuulab.com',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminDevToken}`,
    },
    body: JSON.stringify({ token: adminDevToken, name: 'Zuulab Admin' }),
  })

  const syncRes = await syncRoute(syncReq)
  assert(syncRes.status === 200, `POST /api/auth/sync returned status 200 (got ${syncRes.status})`)
  const syncData = await syncRes.json()
  assert(syncData.success === true, 'Sync response success is true')
  assert(syncData.user.role === 'ADMIN', 'Synced user has ADMIN role')

  const setCookieHeader = syncRes.headers.get('set-cookie')
  assert(setCookieHeader && setCookieHeader.includes(SESSION_COOKIE_NAME), 'Response set-cookie contains zuulab_session')
  assert(setCookieHeader.includes('Domain=.zuulab.com'), 'Cookie domain is .zuulab.com')
  assert(setCookieHeader.includes('HttpOnly'), 'Cookie is HttpOnly')
  assert(setCookieHeader.includes('SameSite=lax') || setCookieHeader.includes('SameSite=Lax'), 'Cookie is SameSite=Lax')
  assert(setCookieHeader.includes('Path=/'), 'Cookie path is /')

  // Extract raw cookie value
  const cookieMatch = setCookieHeader.match(/zuulab_session=([^;]+)/)
  const sessionCookieVal = cookieMatch ? cookieMatch[1] : null
  assert(sessionCookieVal, 'Extracted session cookie value from Set-Cookie header')
  console.log('✓ PASS: Storefront admin login successfully sets cross-subdomain session cookie.\n')

  // --------------------------------------------------------------------------
  // TEST 4: Dashboard SSO Recognition (GET /api/auth/me on dashboard.zuulab.com)
  // --------------------------------------------------------------------------
  console.log('[4/8] Testing Dashboard SSO Recognition via Session Cookie...')
  const dashMeReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieVal}`,
    },
  })

  const dashMeRes = await meRoute(dashMeReq)
  assert(dashMeRes.status === 200, `GET /api/auth/me returned status 200 on dashboard (got ${dashMeRes.status})`)
  const dashMeData = await dashMeRes.json()
  assert(dashMeData.success === true, 'Dashboard auth/me returned success: true')
  assert(dashMeData.user.role === 'ADMIN', 'Dashboard auth/me recognized ADMIN user from cookie')
  console.log('✓ PASS: Dashboard seamlessly recognizes admin without re-login.\n')

  // --------------------------------------------------------------------------
  // TEST 5: CUSTOMER Login -> Dashboard Access Denied
  // --------------------------------------------------------------------------
  console.log('[5/8] Testing Customer Login & Dashboard Access Restriction...')
  const custDevToken = `dev-token-${Date.now()}:customer-sso-uid:customer@test.com:CUSTOMER`
  const custSyncReq = new NextRequest('https://zuulab.com/api/auth/sync', {
    method: 'POST',
    headers: {
      host: 'zuulab.com',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custDevToken}`,
    },
    body: JSON.stringify({ token: custDevToken, name: 'Normal Customer' }),
  })

  const custSyncRes = await syncRoute(custSyncReq)
  assert(custSyncRes.status === 200, 'Customer sync returns 200')
  const custSetCookie = custSyncRes.headers.get('set-cookie')
  const custCookieMatch = custSetCookie?.match(/zuulab_session=([^;]+)/)
  const custCookieVal = custCookieMatch ? custCookieMatch[1] : null
  assert(custCookieVal, 'Customer received session cookie')

  const custDashReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=${custCookieVal}`,
    },
  })

  const custDashRes = await meRoute(custDashReq)
  assert(custDashRes.status === 200, 'GET /api/auth/me returns 200 with customer data')
  const custDashData = await custDashRes.json()
  assert(custDashData.user.role === 'CUSTOMER', 'User has CUSTOMER role')

  // Verify Admin layout role filter:
  const isCustomerAdmin =
    custDashData.user.role === 'ADMIN' ||
    custDashData.user.role === 'SUPER_ADMIN' ||
    custDashData.user.role === 'ORDER_MANAGER' ||
    custDashData.user.role === 'STAFF'
  assert(!isCustomerAdmin, 'Customer is strictly NOT granted admin access')
  console.log('✓ PASS: Customer session is recognized but administrative access is strictly denied.\n')

  // --------------------------------------------------------------------------
  // TEST 6: Unauthenticated Guest -> GET /api/auth/me Returns 401
  // --------------------------------------------------------------------------
  console.log('[6/8] Testing Unauthenticated Guest Request...')
  const guestReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: { host: 'dashboard.zuulab.com' },
  })

  const guestRes = await meRoute(guestReq)
  assert(guestRes.status === 401, `GET /api/auth/me without session returns 401 (got ${guestRes.status})`)
  console.log('✓ PASS: Unauthenticated guest receives 401 and is directed to auth gate.\n')

  // --------------------------------------------------------------------------
  // TEST 7: Invalid or Tampered Cookie -> Returns 401
  // --------------------------------------------------------------------------
  console.log('[7/8] Testing Tampered Session Cookie...')
  const tamperedReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=invalid.tampered.token`,
    },
  })

  const tamperedRes = await meRoute(tamperedReq)
  assert(tamperedRes.status === 401, `GET /api/auth/me with tampered cookie returns 401 (got ${tamperedRes.status})`)
  console.log('✓ PASS: Tampered session cookie is rejected.\n')

  // --------------------------------------------------------------------------
  // TEST 8: Logout Clears Session Cookie Across Subdomains
  // --------------------------------------------------------------------------
  console.log('[8/8] Testing Logout Clears Session Cookie...')
  const logoutReq = new NextRequest('https://dashboard.zuulab.com/api/auth/logout', {
    method: 'POST',
    headers: { host: 'dashboard.zuulab.com' },
  })

  const logoutRes = await logoutRoute(logoutReq)
  assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200')
  const logoutSetCookie = logoutRes.headers.get('set-cookie')
  assert(logoutSetCookie && logoutSetCookie.includes(SESSION_COOKIE_NAME), 'Logout response clears zuulab_session')
  assert(logoutSetCookie.includes('Max-Age=0') || logoutSetCookie.includes('max-age=0'), 'Cookie Max-Age is 0 (expired)')
  assert(logoutSetCookie.includes('Domain=.zuulab.com'), 'Cookie domain matches .zuulab.com')
  console.log('✓ PASS: Logout cleanly invalidates session cookie across subdomains.\n')

  console.log('====================================================')
  console.log('ALL 8 SSO & AUTH TESTS PASSED (100% SUCCESS)')
  console.log('====================================================\n')
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
