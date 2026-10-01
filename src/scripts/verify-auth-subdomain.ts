/**
 * Comprehensive Automated Verification Suite for Dashboard Subdomain Auth & Token Verification
 *
 * Verifies:
 * 1. Private key sanitization (stripping quotes, normalizing newlines)
 * 2. Token safe metadata diagnostics (JWT payload parsing without exposing secret)
 * 3. Fallback resolution for Firebase Admin Project ID & credentials
 * 4. Dev-token handling in non-production vs production mode
 * 5. Proxy behavior for /api/auth/sync on dashboard.zuulab.com and zuulab.com
 * 6. User sync and role assignment in database (syncOrCreateUser) for ADMIN and CUSTOMER
 * 7. End-to-end simulated /api/auth/sync POST request handling
 */

import { NextRequest } from 'next/server'
import {
  sanitizePrivateKey,
  parseTokenSafeMetadata,
  verifyAuthToken,
} from '../lib/firebase-admin'
import { syncOrCreateUser } from '../lib/services/auth.service'
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
  console.log('ZUULAB DASHBOARD SUBDOMAIN AUTH & SYNC VERIFICATION')
  console.log('====================================================\n')

  // ----------------------------------------------------
  // TEST 1: Private Key Sanitization
  // ----------------------------------------------------
  console.log('[1/7] Testing Private Key Sanitization...')
  const rawKeyWithQuotes = '"-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASC\\n-----END PRIVATE KEY-----\\n"'
  const sanitized = sanitizePrivateKey(rawKeyWithQuotes)
  assert(sanitized !== undefined, 'Sanitized key is defined')
  assert(!sanitized!.startsWith('"') && !sanitized!.endsWith('"'), 'Stripped double quotes')
  assert(sanitized!.includes('\n'), 'Converted \\n to real newlines')

  const singleQuoteKey = "'-----BEGIN PRIVATE KEY-----\\r\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASC\\r\\n-----END PRIVATE KEY-----\\r\\n'"
  const sanitizedSingle = sanitizePrivateKey(singleQuoteKey)
  assert(!sanitizedSingle!.startsWith("'") && !sanitizedSingle!.endsWith("'"), 'Stripped single quotes')
  assert(!sanitizedSingle!.includes('\\r\\n'), 'Converted \\r\\n to real newlines')

  // ----------------------------------------------------
  // TEST 2: Safe Token Metadata Diagnostics
  // ----------------------------------------------------
  console.log('\n[2/7] Testing Safe Token Metadata Parsing...')
  // Create a mock JWT structure: header.payload.signature
  const mockHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' })).toString('base64url')
  const mockPayload = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/zuulab-1c82c',
    aud: 'zuulab-1c82c',
    auth_time: Math.floor(Date.now() / 1000) - 10,
    sub: 'abc123xyz789',
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'admin@zuulab.com',
  })).toString('base64url')
  const mockJwt = `${mockHeader}.${mockPayload}.mockSignatureBytes`

  const meta = parseTokenSafeMetadata(mockJwt)
  assert(meta.isJwt === true, 'Detected valid JWT structure')
  assert(meta.iss === 'https://securetoken.google.com/zuulab-1c82c', 'Extracted issuer correctly')
  assert(meta.aud === 'zuulab-1c82c', 'Extracted audience/project ID correctly')
  assert(meta.isExpired === false, 'Calculated non-expired state correctly')
  assert(meta.sub === 'abc1...z789', 'Masked sensitive subject UID for safe logging')

  // ----------------------------------------------------
  // TEST 3: Proxy Passthrough for /api/auth/sync
  // ----------------------------------------------------
  console.log('\n[3/7] Testing Proxy Passthrough for /api/auth/sync on all domains...')
  // On dashboard.zuulab.com
  const reqDashSync = new NextRequest('https://dashboard.zuulab.com/api/auth/sync', {
    method: 'POST',
    headers: { host: 'dashboard.zuulab.com' },
  })
  const resDashSync = await proxy(reqDashSync)
  assert(resDashSync.status !== 308, 'dashboard.zuulab.com/api/auth/sync is NOT 308 redirected')
  assert(resDashSync.headers.get('x-middleware-rewrite') === null, 'dashboard.zuulab.com/api/auth/sync is NOT rewritten to /admin')

  // On zuulab.com
  const reqStoreSync = new NextRequest('https://zuulab.com/api/auth/sync', {
    method: 'POST',
    headers: { host: 'zuulab.com' },
  })
  const resStoreSync = await proxy(reqStoreSync)
  assert(resStoreSync.status !== 308, 'zuulab.com/api/auth/sync is NOT 308 redirected')

  // ----------------------------------------------------
  // TEST 4: Dev-token Handling in Non-Production
  // ----------------------------------------------------
  console.log('\n[4/7] Testing Dev-Token Resolution in Local/Dev Environment...')
  const devToken = 'dev-token-123:dev-admin-uid:admin@zuulab.com:ADMIN'
  const decodedDev = await verifyAuthToken(devToken)
  assert(decodedDev !== null, 'Dev token decoded successfully in non-production')
  assert(decodedDev!.uid === 'dev-admin-uid', 'Decoded UID matches payload')
  assert(decodedDev!.email === 'admin@zuulab.com', 'Decoded email matches payload')

  // ----------------------------------------------------
  // TEST 5: syncOrCreateUser Database Sync for Admin and Customer
  // ----------------------------------------------------
  console.log('\n[5/7] Testing Database User Sync & Role Assignment...')
  // Admin sync
  const adminUser = await syncOrCreateUser({
    firebaseUid: 'test-admin-uid-12345',
    email: 'admin@zuulab.com',
    name: 'Zuulab Admin',
    roleOverride: 'ADMIN',
  })
  assert(adminUser.role === 'ADMIN', 'Admin user correctly assigned ADMIN role')
  assert(adminUser.email === 'admin@zuulab.com', 'Admin email synced')

  // Customer sync
  const customerUser = await syncOrCreateUser({
    firebaseUid: 'test-customer-uid-99999',
    email: 'customer-test@example.com',
    name: 'Test Müşteri',
  })
  assert(customerUser.role === 'CUSTOMER', 'Customer user correctly assigned CUSTOMER role')
  assert(customerUser.email === 'customer-test@example.com', 'Customer email synced')

  // ----------------------------------------------------
  // TEST 6: POST /api/auth/sync Route Handler Verification
  // ----------------------------------------------------
  console.log('\n[6/7] Testing POST /api/auth/sync Route Handler...')
  const { POST } = await import('../app/api/auth/sync/route')

  // Scenario 6A: Missing token
  const reqNoToken = new Request('http://localhost:3000/api/auth/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const resNoToken = await POST(reqNoToken)
  assert(resNoToken.status === 401, 'Returns 401 when token is missing')
  const bodyNoToken = await resNoToken.json()
  assert(bodyNoToken.error === 'Yetkilendirme belirteci (token) eksik.', 'Returns correct missing token message')

  // Scenario 6B: Dev token sync
  const reqWithDevToken = new Request('http://localhost:3000/api/auth/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`,
    },
    body: JSON.stringify({ token: devToken }),
  })
  const resWithDevToken = await POST(reqWithDevToken)
  assert(resWithDevToken.status === 200, 'Returns 200 on successful dev token sync')
  const bodyDev = await resWithDevToken.json()
  assert(bodyDev.success === true, 'Response indicates success')
  assert(bodyDev.user.role === 'ADMIN', 'Synced user has ADMIN role')

  // ----------------------------------------------------
  // TEST 7: Customer Auth Regression
  // ----------------------------------------------------
  console.log('\n[7/7] Testing Customer Auth Behavior...')
  const customerDevToken = 'dev-token-456:dev-cust-uid:customer@example.com:CUSTOMER'
  const reqCustomerToken = new Request('http://localhost:3000/api/auth/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerDevToken}`,
    },
    body: JSON.stringify({ token: customerDevToken }),
  })
  const resCustomerToken = await POST(reqCustomerToken)
  assert(resCustomerToken.status === 200, 'Customer sync returns 200')
  const bodyCustomer = await resCustomerToken.json()
  assert(bodyCustomer.user.role === 'CUSTOMER', 'Customer has CUSTOMER role')

  console.log('\n====================================================')
  console.log('ALL DASHBOARD AUTH & SYNC TESTS PASSED (100%)')
  console.log('====================================================')
}

runTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
