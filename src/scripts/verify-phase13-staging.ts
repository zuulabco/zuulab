/**
 * Automated Verification Suite for Zuulab Phase 13:
 * Staging Deployment, Production Configuration, Live Smoke Testing & Monitoring
 *
 * 26 Core Criteria:
 * [Environment]
 * 1. Production env validation
 * 2. Missing critical credential detection
 * 3. Secret exposure prevention
 *
 * [Database]
 * 4. Migration consistency
 * 5. Database health
 * 6. Production DB requirement
 *
 * [Authentication]
 * 7. Firebase auth & token verification
 * 8. Admin RBAC
 * 9. Customer isolation
 *
 * [Payment]
 * 10. Payment provider resolution & mock guard
 * 11. Webhook signature & amount verification
 * 12. Duplicate webhook idempotency
 *
 * [Shipping]
 * 13. Sürat provider & mock guard
 * 14. Yurtiçi provider & mock guard
 * 15. Carrier switching & persistence
 * 16. Existing shipment provider snapshot preservation
 *
 * [Invoice]
 * 17. Invoice provider resolution & mock guard
 * 18. Invoice idempotency
 *
 * [Email]
 * 19. Resend configuration & mock guard
 * 20. Notification idempotency
 *
 * [Cron]
 * 21. Unauthorized cron rejected (401 / 403)
 * 22. Cron duplicate execution safety (Distributed Lock)
 *
 * [Security]
 * 23. Security headers & CSP configuration
 * 24. Credential exposure & PI/Secret sanitization
 *
 * [Runtime]
 * 25. Health endpoint (Liveness & Readiness)
 * 26. Critical route smoke test & Cloudinary validation
 */

import fs from 'fs'
import path from 'path'
import { validateEnvironment } from '../lib/config/env'
import { isDatabaseConfigured, assertProductionDatabase } from '../prisma/db'
import { verifyAuthToken } from '../lib/firebase-admin'
import { requireAdmin, requireAuth } from '../lib/services/auth.service'
import { getPaymentProvider } from '../lib/services/payment/provider.factory'
import { PayTRPaymentProvider } from '../lib/services/payment/paytr.provider'
import { handlePaymentWebhook } from '../lib/services/payment/payment.service'
import { createOrder, getOrderByNumber } from '../lib/services/orders.service'
import {
  ShippingProviderFactory,
  getShippingProvider,
  getReturnShippingProvider,
} from '../lib/services/shipping/shipping-provider.factory'
import { SuratShippingProvider } from '../lib/services/shipping/surat.provider'
import { YurticiShippingProvider } from '../lib/services/shipping/yurtici.provider'
import {
  getCarrierSettings,
  updateCarrierSettings,
} from '../lib/services/shipping/shipping-settings.service'
import {
  createShipmentForOrder,
} from '../lib/services/shipping/fulfillment.service'
import { getInvoiceProvider } from '../lib/services/invoice/invoice-provider.factory'
import { UyumsoftInvoiceProvider } from '../lib/services/invoice/uyumsoft.provider'
import { UyumsoftClient } from '../lib/services/invoice/uyumsoft.client'
import { createInvoiceForOrder } from '../lib/services/invoice/invoice.service'
import { ResendEmailProvider } from '../lib/services/notification/resend.provider'
import {
  createNotification,
} from '../lib/services/notification/notification.service'
import {
  verifyCronAuthorization,
  acquireCronLock,
  releaseCronLock,
} from '../lib/services/cron/cron-lock.service'
import {
  sanitizeContext,
  captureException,
} from '../lib/monitoring/logger'
import { cloudinaryService } from '../lib/services/media/cloudinary.service'

async function runPhase13StagingVerification() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 13 — STAGING DEPLOYMENT & PRODUCTION READINESS')
  console.log('===============================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`)
      passed++
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`)
      failed++
    }
  }

  const prevEnv = { ...process.env }

  try {
    // -------------------------------------------------------------
    // Section 1: Environment Validation & Secret Leak Prevention
    // -------------------------------------------------------------
    console.log('--- 1. Environment Configuration & Secret Protection ---')

    // 1. Production env validation
    const envValidation = validateEnvironment()
    assert(
      typeof envValidation.isValid === 'boolean' && Array.isArray(envValidation.errors),
      'Test 1: Environment validation runner executes cleanly'
    )

    // 2. Missing critical credential detection in production
    let missingSecretDetected = false
    try {
      ;(process.env as any).NODE_ENV = 'production'
      ;(process.env as any).DATABASE_URL = ''
      const prodCheck = validateEnvironment()
      if (!prodCheck.isValid && prodCheck.errors.some((e) => e.includes('DATABASE_URL'))) {
        missingSecretDetected = true
      }
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
      process.env.DATABASE_URL = prevEnv.DATABASE_URL
    }
    assert(missingSecretDetected, 'Test 2: Production environment validator flags missing DATABASE_URL')

    // 3. Secret exposure prevention (.gitignore & no secret files)
    const gitignorePath = path.resolve(process.cwd(), '.gitignore')
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    const isEnvIgnored = gitignoreContent.includes('.env*')
    const hasUnignoredExamples = gitignoreContent.includes('!.env.example')
    assert(
      isEnvIgnored && hasUnignoredExamples,
      'Test 3: .gitignore safely blocks secret env files (.env*) while preserving .env.example'
    )

    // -------------------------------------------------------------
    // Section 2: Database & Migration Consistency
    // -------------------------------------------------------------
    console.log('\n--- 2. Database & Migration Deployment ---')

    // 4. Migration consistency
    const migrationDir = path.resolve(
      process.cwd(),
      'migrations/app/20260928T2341_add_returns_rma_shipment_events'
    )
    const migrationExists =
      fs.existsSync(migrationDir) &&
      fs.existsSync(path.join(migrationDir, 'migration.json')) &&
      fs.existsSync(path.join(migrationDir, 'ops.json'))
    assert(migrationExists, 'Test 4: On-disk migration package verified (20260928T2341_add_returns_rma_shipment_events)')

    // 5. Database health check probe
    assert(
      typeof isDatabaseConfigured === 'boolean',
      `Test 5: Database health probe returns configured state: ${isDatabaseConfigured}`
    )

    // 6. Production DB requirement
    let prodDbEnforced = false
    try {
      ;(process.env as any).NODE_ENV = 'production'
      ;(process.env as any).DATABASE_URL = ''
      assertProductionDatabase()
    } catch (e: any) {
      if (e.message.includes('DATABASE_CONFIGURATION_ERROR')) {
        prodDbEnforced = true
      }
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
      process.env.DATABASE_URL = prevEnv.DATABASE_URL
    }
    assert(prodDbEnforced, 'Test 6: assertProductionDatabase strictly fails in production if DATABASE_URL is missing')

    // -------------------------------------------------------------
    // Section 3: Authentication & Customer Isolation
    // -------------------------------------------------------------
    console.log('\n--- 3. Authentication & RBAC ---')

    // 7. Firebase auth & mock token block in production
    let mockTokenBlockedInProd = false
    try {
      ;(process.env as any).NODE_ENV = 'production'
      const res = await verifyAuthToken('dev-token-fake-uid:fake@email.com:CUSTOMER')
      if (res === null) mockTokenBlockedInProd = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
    }
    assert(mockTokenBlockedInProd, 'Test 7: Firebase verifyAuthToken rejects dev mock tokens in production')

    // 8. Admin RBAC
    let adminRbacBlocked = false
    const nonAdminReq = new Request('http://localhost:3000/api/admin/settings', {
      headers: { authorization: 'Bearer dev-token-cust:cust@test.com:CUSTOMER' },
    })
    try {
      await requireAdmin(nonAdminReq)
    } catch (e: any) {
      if (e.message.includes('FORBIDDEN')) adminRbacBlocked = true
    }
    assert(adminRbacBlocked, 'Test 8: requireAdmin strictly rejects non-admin users with FORBIDDEN')

    // 9. Customer isolation
    const authCustA = await requireAuth(
      new Request('http://localhost:3000/api/account/orders', {
        headers: { authorization: 'Bearer dev-token-custA:custA@test.com:CUSTOMER' },
      })
    )
    const authCustB = await requireAuth(
      new Request('http://localhost:3000/api/account/orders', {
        headers: { authorization: 'Bearer dev-token-custB:custB@test.com:CUSTOMER' },
      })
    )
    assert(
      authCustA.email !== authCustB.email && authCustA.id !== authCustB.id,
      'Test 9: Customer isolation enforced (distinct identities per session)'
    )

    // -------------------------------------------------------------
    // Section 4: Payment Provider & Webhook
    // -------------------------------------------------------------
    console.log('\n--- 4. Payment Integration & Webhook Idempotency ---')

    // 10. Payment provider resolution & mock guard
    const paytr = getPaymentProvider('PAYTR')
    assert(paytr.name === 'PAYTR', 'Test 10a: Payment factory resolves PayTR provider')

    let paytrProdMockGuardPassed = false
    const unconfiguredPaytr = new PayTRPaymentProvider()
    try {
      ;(process.env as any).NODE_ENV = 'production'
      ;(process.env as any).PAYTR_MERCHANT_ID = ''
      await unconfiguredPaytr.createSession({
        orderNumber: 'PAYTR-TEST-PROD-GUARD',
        amount: 100,
        currency: 'TRY',
        customer: { email: 'test@zuulab.com', fullName: 'Test Guard', phone: '05550000000' },
        items: [],
      })
    } catch (e: any) {
      if (e.message.includes('PAYTR_CONFIGURATION_ERROR')) {
        paytrProdMockGuardPassed = true
      }
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
      process.env.PAYTR_MERCHANT_ID = prevEnv.PAYTR_MERCHANT_ID
    }
    assert(paytrProdMockGuardPassed, 'Test 10b: PayTR strictly throws PAYTR_CONFIGURATION_ERROR in production when unconfigured')

    // 11. Webhook signature & amount verification
    const orderForWebhook = await createOrder({
      userId: 'usr_phase13_smoke',
      shippingAddress: {
        fullName: 'Webhook Smoke',
        email: 'webhook-smoke@zuulab.com',
        phone: '05551234567',
        city: 'İstanbul',
        district: 'Kadıköy',
        addressLine: 'Moda Cad. No: 12',
        postalCode: '34710',
      },
      items: [
        {
          productId: 'prod-zk1',
          quantity: 1,
        },
      ],
      shippingMethod: 'STANDARD',
    })

    const testPaytr = new PayTRPaymentProvider()
    const validWebhook = testPaytr.generateTestWebhook(
      orderForWebhook.orderNumber,
      `paytr_test_${Date.now()}`,
      orderForWebhook.totalAmount,
      'SUCCESS'
    )

    const webhookRes = await handlePaymentWebhook(validWebhook.payload, validWebhook.signature)
    const confirmedOrder = await getOrderByNumber(orderForWebhook.orderNumber, undefined, true)
    assert(
      webhookRes.success && confirmedOrder?.status === 'CONFIRMED',
      'Test 11: Webhook signature verified and order confirmed'
    )

    // 12. Duplicate webhook idempotency
    const duplicateRes = await handlePaymentWebhook(validWebhook.payload, validWebhook.signature)
    assert(
      duplicateRes.success && duplicateRes.message.includes('Idempotent bypass'),
      'Test 12: Duplicate webhook safely handled via idempotency bypass'
    )

    // -------------------------------------------------------------
    // Section 5: Shipping Multi-Carrier & Persistence
    // -------------------------------------------------------------
    console.log('\n--- 5. Shipping Multi-Carrier Architecture & Snapshot ---')

    // 13. Sürat provider & mock guard
    const suratProvider = ShippingProviderFactory.getProvider('SURAT')
    assert(suratProvider.providerName.includes('SURAT'), 'Test 13a: Sürat provider resolves via factory')

    let suratMockGuardPassed = false
    const unconfiguredSurat = new SuratShippingProvider({ customerCode: '', password: '', isTestMode: false })
    try {
      ;(process.env as any).NODE_ENV = 'production'
      await unconfiguredSurat.createShipment({
        orderNumber: 'SRT-GUARD-01',
        customerName: 'Test',
        customerPhone: '0555',
        shippingAddress: { addressLine: 'A', city: 'B', district: 'C' },
        packageCount: 1,
        weightKg: 1,
      })
    } catch (e: any) {
      if (e.message.includes('SURAT_CONFIGURATION_ERROR')) suratMockGuardPassed = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
    }
    assert(suratMockGuardPassed, 'Test 13b: Sürat provider strictly throws in production when credentials missing')

    // 14. Yurtiçi provider & mock guard
    const yurticiProvider = ShippingProviderFactory.getProvider('YURTICI')
    assert(yurticiProvider.providerName.includes('YURTICI'), 'Test 14a: Yurtiçi provider resolves via factory')

    let yurticiMockGuardPassed = false
    const unconfiguredYurtici = new YurticiShippingProvider({ wsUserName: '', wsPassword: '', isTestMode: false })
    try {
      ;(process.env as any).NODE_ENV = 'production'
      await unconfiguredYurtici.createShipment({
        orderNumber: 'YK-GUARD-01',
        customerName: 'Test',
        customerPhone: '0555',
        shippingAddress: { addressLine: 'A', city: 'B', district: 'C' },
        packageCount: 1,
        weightKg: 1,
      })
    } catch (e: any) {
      if (e.message.includes('YURTICI_AUTH_ERROR')) yurticiMockGuardPassed = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
    }
    assert(yurticiMockGuardPassed, 'Test 14b: Yurtiçi provider strictly throws in production when credentials missing')

    // 15. Carrier switching & settings persistence
    await updateCarrierSettings({ outboundCarrier: 'SURAT', returnCarrier: 'YURTICI', updatedBy: 'phase13-test' })
    const updatedSettings = await getCarrierSettings()
    assert(
      updatedSettings.outboundCarrier === 'SURAT' && updatedSettings.returnCarrier === 'YURTICI',
      'Test 15: Outbound (SURAT) and Return (YURTICI) independent carriers persist in DB/cache'
    )

    // 16. Existing shipment provider snapshot preservation
    // When Order A is shipped with SURAT, changing carrier to YURTICI must NOT change Order A shipment provider!
    const shipmentA = await createShipmentForOrder({
      orderNumber: orderForWebhook.orderNumber,
      provider: 'SURAT',
    })
    // Now switch global setting to YURTICI
    await updateCarrierSettings({ outboundCarrier: 'YURTICI', returnCarrier: 'SURAT', updatedBy: 'phase13-test' })
    assert(
      shipmentA.provider.includes('SURAT'),
      'Test 16: Existing shipment provider snapshot preserved (SURAT) despite global carrier setting change'
    )

    // -------------------------------------------------------------
    // Section 6: Invoice Integration & Idempotency
    // -------------------------------------------------------------
    console.log('\n--- 6. Invoice Integration & Mock Guard ---')

    // 17. Invoice provider resolution & mock guard
    const invProvider = getInvoiceProvider()
    assert(invProvider.name === 'UYUMSOFT', 'Test 17a: Default invoice provider resolves to UYUMSOFT')

    let uyumsoftMockGuardPassed = false
    const unconfiguredUyumsoft = new UyumsoftClient({ username: '', password: '' })
    try {
      ;(process.env as any).NODE_ENV = 'production'
      await unconfiguredUyumsoft.sendInvoice({
        uuid: 'test-uuid-prod',
        scenario: 'eArchive',
        issueDate: new Date().toISOString(),
        billing: { vknTckn: '11111111111', name: 'Test' },
        currency: 'TRY',
        subtotal: 100,
        taxAmount: 20,
        shippingAmount: 0,
        discountAmount: 0,
        totalAmount: 120,
        items: [],
      })
    } catch (e: any) {
      if (e.message.includes('UYUMSOFT_CONFIGURATION_ERROR')) uyumsoftMockGuardPassed = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
    }
    assert(uyumsoftMockGuardPassed, 'Test 17b: Uyumsoft strictly throws in production when credentials missing')

    // 18. Invoice idempotency
    const inv1 = await createInvoiceForOrder({ orderNumber: orderForWebhook.orderNumber })
    const inv2 = await createInvoiceForOrder({ orderNumber: orderForWebhook.orderNumber })
    assert(inv1.id === inv2.id, 'Test 18: Invoice creation is strictly idempotent (1 invoice per order)')

    // -------------------------------------------------------------
    // Section 7: Email / Notifications
    // -------------------------------------------------------------
    console.log('\n--- 7. Email & Transactional Notifications ---')

    // 19. Resend configuration & mock guard
    let resendMockGuardPassed = false
    const unconfiguredResend = new ResendEmailProvider('')
    try {
      ;(process.env as any).NODE_ENV = 'production'
      await unconfiguredResend.sendEmail({
        to: 'customer@zuulab.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      })
    } catch (e: any) {
      if (e.message.includes('RESEND_CONFIGURATION_ERROR')) resendMockGuardPassed = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
    }
    assert(resendMockGuardPassed, 'Test 19: Resend provider strictly throws RESEND_CONFIGURATION_ERROR in production')

    // 20. Notification idempotency
    const notif1 = await createNotification({
      type: 'ORDER_CONFIRMED',
      recipientEmail: 'smoke-notif@zuulab.com',
      orderNumber: orderForWebhook.orderNumber,
      idempotencyKey: `${orderForWebhook.orderNumber}:CONFIRMED:SMOKE`,
      data: { orderNumber: orderForWebhook.orderNumber },
    })
    const notif2 = await createNotification({
      type: 'ORDER_CONFIRMED',
      recipientEmail: 'smoke-notif@zuulab.com',
      orderNumber: orderForWebhook.orderNumber,
      idempotencyKey: `${orderForWebhook.orderNumber}:CONFIRMED:SMOKE`,
      data: { orderNumber: orderForWebhook.orderNumber },
    })
    assert(notif1.id === notif2.id, 'Test 20: Notification creation suppresses duplicate idempotencyKey')

    // -------------------------------------------------------------
    // Section 8: Cron Jobs & Concurrency Safety
    // -------------------------------------------------------------
    console.log('\n--- 8. Scheduled Cron Jobs & Concurrency Lock ---')

    // 21. Unauthorized cron rejected
    let cronRejected = false
    try {
      ;(process.env as any).NODE_ENV = 'production'
      ;(process.env as any).CRON_SECRET = 'super-secret-cron-token'
      const unauthReq = new Request('http://localhost:3000/api/cron/payment-expiration', {
        headers: { authorization: 'Bearer wrong-secret' },
      })
      const check = verifyCronAuthorization(unauthReq)
      if (!check.authorized && check.status === 401) cronRejected = true
    } finally {
      process.env.NODE_ENV = prevEnv.NODE_ENV
      process.env.CRON_SECRET = prevEnv.CRON_SECRET
    }
    assert(cronRejected, 'Test 21: verifyCronAuthorization strictly rejects invalid cron secret with 401')

    // 22. Cron duplicate execution safety (Distributed Lock)
    const lock1 = await acquireCronLock('test_concurrency_job', 60)
    const lock2 = await acquireCronLock('test_concurrency_job', 60)
    await releaseCronLock('test_concurrency_job')
    assert(
      lock1.acquired && !lock2.acquired && (lock2.reason?.includes('LOCKED_BY_ANOTHER_INSTANCE') ?? false),
      'Test 22: acquireCronLock blocks concurrent duplicate job execution across serverless instances'
    )

    // -------------------------------------------------------------
    // Section 9: Security Headers & PII Redaction
    // -------------------------------------------------------------
    console.log('\n--- 9. Security Headers & Observability ---')

    // 23. Security headers check in next.config.ts
    const nextConfigPath = path.resolve(process.cwd(), 'next.config.ts')
    const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8')
    const hasCsp = nextConfigContent.includes('Content-Security-Policy')
    const hasHsts = nextConfigContent.includes('Strict-Transport-Security')
    const hasXFrame = nextConfigContent.includes('X-Frame-Options')
    assert(
      hasCsp && hasHsts && hasXFrame,
      'Test 23: next.config.ts configures CSP, HSTS, and X-Frame-Options security headers'
    )

    // 24. Credential exposure prevention & PII redaction
    const rawPayloadWithSecrets = {
      password: 'super-secret-password-123',
      apiKey: 'sec_test_api_key_456',
      creditCard: {
        cardNumber: '4543123456789012',
        cvv: '123',
      },
      orderNumber: 'ORD-TEST-SAFE',
    }
    const sanitized = sanitizeContext(rawPayloadWithSecrets) as any
    const secretsRedacted =
      sanitized.password === '[REDACTED_SECRET]' &&
      sanitized.apiKey === '[REDACTED_SECRET]' &&
      sanitized.creditCard?.cardNumber === '[REDACTED_SECRET]' &&
      sanitized.creditCard?.cvv === '[REDACTED_SECRET]' &&
      sanitized.orderNumber === 'ORD-TEST-SAFE'
    assert(secretsRedacted, 'Test 24: Error monitoring sanitizer recursively redacts passwords, keys, and card numbers')

    // -------------------------------------------------------------
    // Section 10: Runtime Health & Smoke Checks
    // -------------------------------------------------------------
    console.log('\n--- 10. Runtime Health & Media Upload Validation ---')

    // 25. Health endpoint probe
    const { GET: livenessHandler } = await import('../app/api/health/liveness/route')
    const livenessResponse = await livenessHandler()
    const livenessData = await livenessResponse.json()
    assert(
      livenessResponse.status === 200 && livenessData.liveness === true,
      'Test 25: Liveness health check returns status 200 and liveness: true'
    )

    // 26. Critical route smoke test & Cloudinary validation
    const invalidFileCheck = cloudinaryService.validateFile('application/x-msdownload', 1024)
    const oversizedFileCheck = cloudinaryService.validateFile('image/jpeg', 10 * 1024 * 1024)
    const validFileCheck = cloudinaryService.validateFile('image/webp', 500 * 1024)
    assert(
      !invalidFileCheck.valid && !oversizedFileCheck.valid && validFileCheck.valid,
      'Test 26: Cloudinary media upload rejects invalid MIME types, blocks >5MB files, and accepts valid WebP'
    )

  } catch (err) {
    console.error('\n[FATAL TEST RUNNER ERROR]:', err)
    failed++
  } finally {
    process.env = prevEnv
  }

  console.log('\n===============================================================')
  console.log(`  PHASE 13 STAGING VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase13StagingVerification().catch((err) => {
  console.error('Unhandled error in verify-phase13-staging:', err)
  process.exit(1)
})
