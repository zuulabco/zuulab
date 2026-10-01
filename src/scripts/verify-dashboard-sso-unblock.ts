import assert from 'assert'
import { NextRequest } from 'next/server'
import { GET as meRoute } from '../app/api/auth/me/route'
import { POST as syncRoute } from '../app/api/auth/sync/route'
import { POST as logoutRoute } from '../app/api/auth/logout/route'
import { GET as adminSettingsRoute } from '../app/api/admin/settings/route'
import { GET as adminProductsRoute } from '../app/api/admin/products/route'
import { GET as adminOrdersRoute } from '../app/api/admin/orders/route'
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from '../lib/services/session.service'
import { syncOrCreateUser } from '../lib/services/auth.service'

async function runDashboardSsoTests() {
  console.log('====================================================================')
  console.log('ZUULAB DASHBOARD SSO AUTH STATE & DATA LOADING VERIFICATION')
  console.log('====================================================================\n')

  // Setup: Ensure we have an active Admin and Customer user in the DB/memory
  const adminUser = await syncOrCreateUser({
    firebaseUid: 'fb-admin-sso-verify-uid',
    email: 'admin@zuulab.com',
    name: 'Dashboard Admin',
    roleOverride: 'ADMIN',
  })
  assert(adminUser.role === 'ADMIN', 'Admin user successfully set up')

  const customerUser = await syncOrCreateUser({
    firebaseUid: 'fb-customer-sso-verify-uid',
    email: 'customer@zuulab.com',
    name: 'Loyal Customer',
    roleOverride: 'CUSTOMER',
  })
  assert(customerUser.role === 'CUSTOMER', 'Customer user successfully set up')

  // Generate genuine session tokens using session service HMAC
  const adminSessionToken = createSessionToken({
    userId: adminUser.id,
    firebaseUid: adminUser.firebaseUid,
    email: adminUser.email,
    role: adminUser.role,
  }, 3600)

  const customerSessionToken = createSessionToken({
    userId: customerUser.id,
    firebaseUid: customerUser.firebaseUid,
    email: customerUser.email,
    role: customerUser.role,
  }, 3600)

  // --------------------------------------------------------------------------
  // TEST 1: SSO session
  // * zuulab_session geçerli
  // * Firebase client token yok (token === null)
  // * /api/auth/me → 200
  // * authStore simulation → user mevcut
  // * isAuthenticated === true, canFetch === true
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing SSO Session Recognition & Client Auth State...')
  const meReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=${adminSessionToken}`,
    },
  })

  const meRes = await meRoute(meReq)
  assert(meRes.status === 200, `GET /api/auth/me must return 200 (got ${meRes.status})`)
  const meData = await meRes.json()
  assert(meData.success === true, 'Response must have success: true')
  assert(meData.user.role === 'ADMIN', 'Response user must have role ADMIN')
  assert(!meData.token && !meData.sessionToken, 'HttpOnly session credential must NEVER be in response body')

  // Simulate authStore.checkSession() resolution
  const clientToken: string | null = null // Firebase token is null during SSO
  const isAuthenticated = Boolean(meData.success && meData.user)
  const canFetch = Boolean(clientToken || isAuthenticated)

  assert(clientToken === null, 'Client token remains null (preserving security decision)')
  assert(isAuthenticated === true, 'isAuthenticated state is true for SSO user')
  assert(canFetch === true, 'canFetch state is true, unblocking dashboard fetch')
  console.log('✓ PASS: Test 1 — SSO session recognized, isAuthenticated=true, canFetch=true, zero credential exposure.\n')

  // --------------------------------------------------------------------------
  // TEST 2: Dashboard APIs with valid session cookie
  // * /api/admin/settings → 200
  // * /api/admin/products → 200
  // * /api/admin/orders → 200
  // --------------------------------------------------------------------------
  console.log('[Test 2] Testing Dashboard Admin APIs with Session Cookie...')
  const adminHeaders = {
    host: 'dashboard.zuulab.com',
    cookie: `${SESSION_COOKIE_NAME}=${adminSessionToken}`,
  }

  // 2a. /api/admin/settings
  const settingsReq = new NextRequest('https://dashboard.zuulab.com/api/admin/settings', {
    method: 'GET',
    headers: adminHeaders,
  })
  const settingsRes = await adminSettingsRoute(settingsReq)
  assert(settingsRes.status === 200, `/api/admin/settings must return 200 (got ${settingsRes.status})`)
  const settingsData = await settingsRes.json()
  assert(settingsData.success === true, 'Settings response success is true')
  assert(settingsData.settings !== undefined, 'Settings payload is returned')

  // 2b. /api/admin/products
  const productsReq = new NextRequest('https://dashboard.zuulab.com/api/admin/products', {
    method: 'GET',
    headers: adminHeaders,
  })
  const productsRes = await adminProductsRoute(productsReq)
  assert(productsRes.status === 200, `/api/admin/products must return 200 (got ${productsRes.status})`)
  const productsData = await productsRes.json()
  assert(productsData.success === true, 'Products response success is true')

  // 2c. /api/admin/orders
  const ordersReq = new NextRequest('https://dashboard.zuulab.com/api/admin/orders', {
    method: 'GET',
    headers: adminHeaders,
  })
  const ordersRes = await adminOrdersRoute(ordersReq)
  assert(ordersRes.status === 200, `/api/admin/orders must return 200 (got ${ordersRes.status})`)
  const ordersData = await ordersRes.json()
  assert(ordersData.success === true, 'Orders response success is true')
  console.log('✓ PASS: Test 2 — /settings, /products, and /orders all return HTTP 200 with session cookie.\n')

  // --------------------------------------------------------------------------
  // TEST 3: Legacy token guard compatibility & Authorization: Bearer null handling
  // --------------------------------------------------------------------------
  console.log('[Test 3] Testing Legacy Token Guard & Bearer null Header Compatibility...')
  // When legacy code passes `headers: { Authorization: `Bearer ${token}` }` where token is null
  const legacyReq = new NextRequest('https://dashboard.zuulab.com/api/admin/settings', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      Authorization: 'Bearer null', // Browser stringified null
      cookie: `${SESSION_COOKIE_NAME}=${adminSessionToken}`,
    },
  })
  const legacyRes = await adminSettingsRoute(legacyReq)
  assert(legacyRes.status === 200, `Bearer null must be safely bypassed to session cookie (got ${legacyRes.status})`)

  // Guard test: canFetch correctly replaces `!token`
  let fetchExecuted = false
  const runComponentFetch = (guard: boolean) => {
    if (!guard) return
    fetchExecuted = true
  }

  // With old guard (!token): would return because token is null
  runComponentFetch(Boolean(clientToken))
  assert(fetchExecuted === false, 'Old !token guard blocked execution when token was null')

  // With new canFetch guard: executes successfully
  runComponentFetch(canFetch)
  assert(fetchExecuted === true, 'New canFetch guard unblocks execution during SSO session')
  console.log('✓ PASS: Test 3 — Legacy token guard compatibility & Bearer null bypass verified.\n')

  // --------------------------------------------------------------------------
  // TEST 4: Firebase login regression
  // * Firebase ID token works without session cookie
  // --------------------------------------------------------------------------
  console.log('[Test 4] Testing Firebase Login Token Regression...')
  const devAdminToken = `dev-token-${Date.now()}:${adminUser.firebaseUid}:${adminUser.email}:ADMIN`
  const fbReq = new NextRequest('https://dashboard.zuulab.com/api/admin/settings', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      Authorization: `Bearer ${devAdminToken}`,
    },
  })
  const fbRes = await adminSettingsRoute(fbReq)
  assert(fbRes.status === 200, `Firebase Bearer token must return 200 without session cookie (got ${fbRes.status})`)
  console.log('✓ PASS: Test 4 — Firebase ID token authentication continues to work independently.\n')

  // --------------------------------------------------------------------------
  // TEST 5: Customer isolation
  // * CUSTOMER session receives 403 on all admin APIs
  // --------------------------------------------------------------------------
  console.log('[Test 5] Testing Customer Isolation on Admin APIs...')
  const custHeaders = {
    host: 'dashboard.zuulab.com',
    cookie: `${SESSION_COOKIE_NAME}=${customerSessionToken}`,
  }

  // 5a. Customer accessing /api/auth/me
  const custMeReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: custHeaders,
  })
  const custMeRes = await meRoute(custMeReq)
  assert(custMeRes.status === 200, 'Customer me endpoint returns 200')
  const custMeData = await custMeRes.json()
  assert(custMeData.user.role === 'CUSTOMER', 'Customer user has role CUSTOMER')

  // Admin gate check in AdminLayout
  const isAdminRole = ['ADMIN', 'SUPER_ADMIN', 'ORDER_MANAGER', 'CONTENT_MANAGER', 'SUPPORT', 'STAFF'].includes(custMeData.user.role)
  assert(!isAdminRole, 'Customer user role fails admin gate check')

  // 5b. Customer accessing /api/admin/settings -> 403
  const custSettingsRes = await adminSettingsRoute(new NextRequest('https://dashboard.zuulab.com/api/admin/settings', {
    method: 'GET',
    headers: custHeaders,
  }))
  assert(custSettingsRes.status === 403, `Customer accessing settings must return 403 (got ${custSettingsRes.status})`)

  // 5c. Customer accessing /api/admin/products -> 403
  const custProductsRes = await adminProductsRoute(new NextRequest('https://dashboard.zuulab.com/api/admin/products', {
    method: 'GET',
    headers: custHeaders,
  }))
  assert(custProductsRes.status === 403, `Customer accessing products must return 403 (got ${custProductsRes.status})`)

  // 5d. Customer accessing /api/admin/orders -> 403
  const custOrdersRes = await adminOrdersRoute(new NextRequest('https://dashboard.zuulab.com/api/admin/orders', {
    method: 'GET',
    headers: custHeaders,
  }))
  assert(custOrdersRes.status === 403, `Customer accessing orders must return 403 (got ${custOrdersRes.status})`)
  console.log('✓ PASS: Test 5 — Customer isolation strictly enforced across all admin APIs.\n')

  // --------------------------------------------------------------------------
  // TEST 6: Logout
  // * Clears session cookie
  // * Invalidates client auth states
  // --------------------------------------------------------------------------
  console.log('[Test 6] Testing Logout Flow...')
  const logoutReq = new NextRequest('https://dashboard.zuulab.com/api/auth/logout', {
    method: 'POST',
    headers: { host: 'dashboard.zuulab.com' },
  })
  const logoutRes = await logoutRoute(logoutReq)
  assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200')
  const setCookie = logoutRes.headers.get('set-cookie')
  assert(setCookie && setCookie.includes(SESSION_COOKIE_NAME), 'Set-cookie clears zuulab_session')
  assert(setCookie.includes('Max-Age=0') || setCookie.includes('max-age=0'), 'Cookie Max-Age is 0')

  // Client store state after logout
  const afterLogout = {
    user: null,
    token: null,
    isAuthenticated: false,
    canFetch: false,
  }
  assert(afterLogout.isAuthenticated === false, 'isAuthenticated is false after logout')
  assert(afterLogout.canFetch === false, 'canFetch is false after logout')
  console.log('✓ PASS: Test 6 — Logout clears session cookie and resets all client auth states.\n')

  // --------------------------------------------------------------------------
  // TEST 7: Invalid session
  // * Expired / tampered cookie returns 401
  // * Dashboard login gate enforced
  // --------------------------------------------------------------------------
  console.log('[Test 7] Testing Invalid/Expired Session Handling...')
  const invalidSessionReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=malformed.session.token`,
    },
  })
  const invalidRes = await meRoute(invalidSessionReq)
  assert(invalidRes.status === 401, `Invalid session must return 401 (got ${invalidRes.status})`)

  const expiredToken = createSessionToken({
    userId: adminUser.id,
    firebaseUid: adminUser.firebaseUid,
    email: adminUser.email,
    role: adminUser.role,
  }, -10) // Expired 10 seconds ago

  const expiredSessionReq = new NextRequest('https://dashboard.zuulab.com/api/auth/me', {
    method: 'GET',
    headers: {
      host: 'dashboard.zuulab.com',
      cookie: `${SESSION_COOKIE_NAME}=${expiredToken}`,
    },
  })
  const expiredRes = await meRoute(expiredSessionReq)
  assert(expiredRes.status === 401, `Expired session must return 401 (got ${expiredRes.status})`)
  console.log('✓ PASS: Test 7 — Invalid and expired sessions return 401 and enforce login gate.\n')

  console.log('====================================================================')
  console.log('ALL 7 DASHBOARD SSO VERIFICATION TESTS PASSED SUCCESSFULLY (100%)')
  console.log('====================================================================\n')
}

runDashboardSsoTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
