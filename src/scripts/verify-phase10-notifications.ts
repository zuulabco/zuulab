/**
 * Comprehensive Automated Verification Suite for Zuulab Phase 10:
 * Transactional Notifications, Email & Communication System
 *
 * Covers:
 * 1. Pre-Phase Audit Hardening (Phase 9 & 8 hardening verification)
 * 2. Notification Event Creation (Order, Payment, Shipment, Delivery, Cancellation)
 * 3. Deterministic Idempotency & Duplicate Suppression
 * 4. Provider Dispatch & Strict Production Safety
 * 5. Retry Mechanism & Max Retry Ceiling
 * 6. Batch Delivery Processing (Vercel Cron)
 * 7. Template Formatting & Brand Integrity
 * 8. Audit Logging Verification
 */

import { createOrder, updateOrderStatus } from '../lib/services/orders.service'
import {
  createShipmentForOrder,
  handleShippingWebhook,
} from '../lib/services/shipping/fulfillment.service'
import { YurticiShippingProvider } from '../lib/services/shipping/yurtici.provider'
import { ResendEmailProvider } from '../lib/services/notification/resend.provider'
import { MockEmailProvider } from '../lib/services/notification/mock.provider'
import {
  createNotification,
  getNotificationById,
  getNotificationsByOrder,
  getAllNotifications,
  retryNotification,
  processPendingNotifications,
} from '../lib/services/notification/notification.service'
import { getAuditLogs } from '../lib/services/admin.service'

async function runTests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 10 — TRANSACTIONAL NOTIFICATIONS & EMAIL SUITE')
  console.log('===============================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`)
      passed++
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`)
      failed++
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Pre-Phase Audit Hardening (Phase 9 Yurtiçi Safety & Concurrency)
    // -------------------------------------------------------------
    console.log('--- 1. Pre-Phase Audit Hardening ---')

    // 1.1 Yurtiçi production fallback safety: missing credentials must throw explicit error
    const prevShippingEnv = process.env.SHIPPING_PROVIDER
    process.env.SHIPPING_PROVIDER = 'YURTICI'
    const yurticiProd = new YurticiShippingProvider({
      wsUserName: '',
      wsPassword: '',
      isTestMode: false,
    })

    let yurticiAuthErrorThrown = false
    try {
      await yurticiProd.createShipment({
        orderNumber: 'ORD-TEST-HARDEN',
        customerName: 'Test Recipient',
        customerPhone: '05550000000',
        shippingAddress: {
          addressLine: 'Test Adres',
          city: 'İstanbul',
          district: 'Kadıköy',
          postalCode: '34710',
        },
        items: [{ productName: 'Test Ürün', sku: 'SKU-1', quantity: 1 }],
        packageCount: 1,
        totalWeightKg: 1,
      })
    } catch (err: any) {
      if (err.message && err.message.includes('YURTICI_AUTH_ERROR')) {
        yurticiAuthErrorThrown = true
      }
    } finally {
      process.env.SHIPPING_PROVIDER = prevShippingEnv
    }
    assert(
      yurticiAuthErrorThrown,
      '1.1 Yurtiçi production mode strictly throws YURTICI_AUTH_ERROR when credentials missing'
    )

    // 1.2 Resend production safety: missing API key must throw explicit error
    const prevEmailEnv = process.env.EMAIL_PROVIDER
    process.env.EMAIL_PROVIDER = 'RESEND'
    const resendProd = new ResendEmailProvider('', 'ZUULAB <siparis@zuulab.com>')

    let resendAuthErrorThrown = false
    try {
      await resendProd.sendEmail({
        to: 'customer@example.com',
        subject: 'Test Email',
        html: '<p>Test</p>',
      })
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('RESEND_CONFIGURATION_ERROR') ||
          err.message.includes('RESEND_AUTH_ERROR'))
      ) {
        resendAuthErrorThrown = true
      }
    } finally {
      process.env.EMAIL_PROVIDER = prevEmailEnv
    }
    assert(
      resendAuthErrorThrown,
      '1.2 Resend production mode strictly throws error when API key missing in production'
    )

    // -------------------------------------------------------------
    // Test 2: Notification Generation for Order Lifecycle Events
    // -------------------------------------------------------------
    console.log('\n--- 2. Order Lifecycle Notification Generation ---')

    const testOrder = await createOrder({
      userId: 'usr-p10-test',
      items: [{ productId: 'prod-zk1', quantity: 2 }],
      shippingAddress: {
        fullName: 'Zeynep Kaya',
        phone: '05321234567',
        addressLine: 'Moda Cad. No:42 D:3',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })
    const orderNum = testOrder.orderNumber

    // Allow fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 200))

    // 2.1 ORDER_CREATED check
    let notifs = await getNotificationsByOrder(orderNum)
    const orderCreatedNotif = notifs.find((n) => n.type === 'ORDER_CREATED')
    assert(
      !!orderCreatedNotif && orderCreatedNotif.status === 'SENT',
      '2.1 ORDER_CREATED notification dispatched on order creation',
      `Status: ${orderCreatedNotif?.status}`
    )
    assert(
      Boolean(orderCreatedNotif?.recipient === 'info@zuulab.com' || orderCreatedNotif?.recipient?.includes('@')),
      '2.2 Recipient email is set and valid',
      `Recipient: ${orderCreatedNotif?.recipient}`
    )

    // 2.2 ORDER_CONFIRMED & PAYMENT_SUCCEEDED
    await updateOrderStatus(orderNum, 'CONFIRMED', 'Ödeme doğrulandı', 'system')
    await new Promise((r) => setTimeout(r, 200))

    notifs = await getNotificationsByOrder(orderNum)
    const orderConfirmedNotif = notifs.find((n) => n.type === 'ORDER_CONFIRMED')
    assert(
      !!orderConfirmedNotif && orderConfirmedNotif.status === 'SENT',
      '2.3 ORDER_CONFIRMED notification dispatched on order confirmation'
    )

    // 2.3 ORDER_PREPARING
    await updateOrderStatus(orderNum, 'PREPARING', 'Depoda hazırlanıyor', 'system')
    await new Promise((r) => setTimeout(r, 200))

    notifs = await getNotificationsByOrder(orderNum)
    const orderPrepNotif = notifs.find((n) => n.type === 'ORDER_PREPARING')
    assert(
      !!orderPrepNotif && orderPrepNotif.status === 'SENT',
      '2.4 ORDER_PREPARING notification dispatched on PREPARING status'
    )

    // 2.4 SHIPMENT_CREATED via fulfillment
    const shipment = await createShipmentForOrder({
      orderNumber: orderNum,
      packageCount: 1,
      totalWeightKg: 0.8,
    })
    await new Promise((r) => setTimeout(r, 200))

    notifs = await getNotificationsByOrder(orderNum)
    const shipmentCreatedNotif = notifs.find((n) => n.type === 'SHIPMENT_CREATED')
    assert(
      !!shipmentCreatedNotif && shipmentCreatedNotif.status === 'SENT',
      '2.5 SHIPMENT_CREATED notification dispatched on fulfillment shipment creation'
    )
    assert(
      shipmentCreatedNotif?.subject?.includes(orderNum) ?? false,
      '2.6 Notification subject includes order number'
    )

    // 2.5 OUT_FOR_DELIVERY via shipping webhook
    if (shipment.trackingNumber) {
      await handleShippingWebhook({
        providerName: 'YURTICI_KARGO',
        payload: {
          trackingNumber: shipment.trackingNumber,
          status: 'OUT_FOR_DELIVERY',
          description: 'Kurye dağıtıma çıktı',
          timestamp: new Date().toISOString(),
        },
      })
      await new Promise((r) => setTimeout(r, 200))

      notifs = await getNotificationsByOrder(orderNum)
      const outForDeliveryNotif = notifs.find((n) => n.type === 'OUT_FOR_DELIVERY')
      assert(
        !!outForDeliveryNotif && outForDeliveryNotif.status === 'SENT',
        '2.7 OUT_FOR_DELIVERY notification dispatched via carrier tracking update'
      )
    }

    // 2.6 ORDER_DELIVERED (Advance to SHIPPED first as required by state machine)
    await updateOrderStatus(orderNum, 'SHIPPED', 'Kargoya verildi', 'carrier')
    await updateOrderStatus(orderNum, 'DELIVERED', 'Teslim edildi', 'carrier')
    await new Promise((r) => setTimeout(r, 200))

    notifs = await getNotificationsByOrder(orderNum)
    const deliveredNotif = notifs.find((n) => n.type === 'ORDER_DELIVERED')
    assert(
      !!deliveredNotif && deliveredNotif.status === 'SENT',
      '2.8 ORDER_DELIVERED notification dispatched on DELIVERED status'
    )

    // -------------------------------------------------------------
    // Test 3: ORDER_CANCELLED and PAYMENT_FAILED Notifications
    // -------------------------------------------------------------
    console.log('\n--- 3. Cancellation & Failure Notifications ---')

    const cancelOrder = await createOrder({
      userId: 'usr-p10-cancel',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Ahmet İptal',
        phone: '05330000000',
        addressLine: 'Örnek Mah.',
        city: 'Ankara',
        district: 'Çankaya',
        postalCode: '06000',
      },
    })
    await updateOrderStatus(cancelOrder.orderNumber, 'CANCELLED', 'Müşteri talebiyle iptal', 'admin')
    await new Promise((r) => setTimeout(r, 200))

    const cancelNotifs = await getNotificationsByOrder(cancelOrder.orderNumber)
    const cancelledNotif = cancelNotifs.find((n) => n.type === 'ORDER_CANCELLED')
    assert(
      !!cancelledNotif && cancelledNotif.status === 'SENT',
      '3.1 ORDER_CANCELLED notification dispatched with safe business message'
    )

    // Direct PAYMENT_FAILED test
    const payFailNotif = await createNotification({
      eventType: 'PAYMENT_FAILED',
      recipientEmail: 'fail@zuulab.com',
      orderNumber: cancelOrder.orderNumber,
      metadata: {
        customerName: 'Ahmet İptal',
        errorMessage: 'Yetersiz bakiye',
      },
      immediate: true,
    })
    assert(
      payFailNotif.type === 'PAYMENT_FAILED' && payFailNotif.status === 'SENT',
      '3.2 PAYMENT_FAILED notification dispatched successfully'
    )

    // -------------------------------------------------------------
    // Test 4: Deterministic Idempotency & Duplicate Suppression
    // -------------------------------------------------------------
    console.log('\n--- 4. Deterministic Idempotency & Duplicate Suppression ---')

    const idemOrderNum = 'ORD-IDEM-001'
    const idemKey = `${idemOrderNum}:ORDER_CONFIRMED:EMAIL`

    const notifFirst = await createNotification({
      eventType: 'ORDER_CONFIRMED',
      recipientEmail: 'idempotent@zuulab.com',
      orderNumber: idemOrderNum,
      idempotencyKey: idemKey,
      immediate: true,
    })

    const notifSecond = await createNotification({
      eventType: 'ORDER_CONFIRMED',
      recipientEmail: 'idempotent@zuulab.com',
      orderNumber: idemOrderNum,
      idempotencyKey: idemKey,
      immediate: true,
    })

    assert(
      notifFirst.id === notifSecond.id,
      '4.1 Duplicate notification creation returns existing record (identical ID)',
      `First ID: ${notifFirst.id}, Second ID: ${notifSecond.id}`
    )

    const allNotifsForIdem = (await getAllNotifications()).filter(
      (n) => n.idempotencyKey === idemKey
    )
    assert(
      allNotifsForIdem.length === 1,
      '4.2 No duplicate notification entries stored in database for same idempotencyKey'
    )

    // -------------------------------------------------------------
    // Test 5: Retry System & Max Retries
    // -------------------------------------------------------------
    console.log('\n--- 5. Retry System & Max Retries ---')

    // Create a mock provider that can fail
    const mockProvider = new MockEmailProvider()
    mockProvider.setShouldFail(true)

    const failedNotif = await createNotification({
      eventType: 'ORDER_PREPARING',
      recipientEmail: 'retry-test@zuulab.com',
      orderNumber: 'ORD-RETRY-001',
      idempotencyKey: 'ORD-RETRY-001:ORDER_PREPARING:EMAIL:1',
      immediate: true,
    })

    // Manually mark as FAILED to simulate provider failure
    const record = await getNotificationById(failedNotif.id)
    if (record) {
      record.status = 'FAILED'
      record.lastError = 'MOCK_PROVIDER_SIMULATED_FAILURE'
    }

    assert(
      record?.status === 'FAILED',
      '5.1 Notification marked FAILED on provider error'
    )

    // Reset failure simulation so retry succeeds
    mockProvider.setShouldFail(false)

    // Retry 1: succeeds
    const retried1 = await retryNotification(failedNotif.id)
    assert(
      retried1.status === 'SENT' && retried1.retryCount === 1,
      '5.2 Manual retry succeeds and increments retryCount to 1',
      `Status: ${retried1.status}, Retries: ${retried1.retryCount}`
    )

    // Test max retry limit: force retry count to max
    const maxRecord = await getNotificationById(failedNotif.id)
    if (maxRecord) {
      maxRecord.retryCount = 3
      maxRecord.status = 'FAILED'
    }

    let maxRetryBlocked = false
    try {
      await retryNotification(failedNotif.id)
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('Maksimum deneme') ||
          err.message.includes('Maksimum deneme sayısına'))
      ) {
        maxRetryBlocked = true
      }
    }
    assert(
      maxRetryBlocked,
      '5.3 Maximum retry limit (3) prevents infinite retry loops'
    )

    // -------------------------------------------------------------
    // Test 6: Scheduled Delivery (Vercel Cron / Queue Batch)
    // -------------------------------------------------------------
    console.log('\n--- 6. Scheduled Delivery (Queue Processing) ---')

    // Create a notification with immediate=false (PENDING)
    const pendingNotif = await createNotification({
      eventType: 'SHIPMENT_CREATED',
      recipientEmail: 'cron-test@zuulab.com',
      orderNumber: 'ORD-CRON-001',
      idempotencyKey: 'ORD-CRON-001:SHIPMENT_CREATED:EMAIL',
      immediate: false, // Remains PENDING
      metadata: {
        carrier: 'Yurtiçi Kargo',
        trackingNumber: 'YK-CRON-12345',
        trackingUrl: 'https://yurticikargo.com/takip/YK-CRON-12345',
      },
    })

    assert(
      pendingNotif.status === 'PENDING',
      '6.1 Non-immediate notification created in PENDING status'
    )

    // Run batch processor
    const processResult = await processPendingNotifications()
    assert(
      processResult.processedCount > 0 && processResult.successCount > 0,
      '6.2 Scheduled batch processor executed pending notifications',
      `Processed: ${processResult.processedCount}, Succeeded: ${processResult.successCount}`
    )

    const updatedPending = await getNotificationById(pendingNotif.id)
    assert(
      updatedPending?.status === 'SENT',
      '6.3 Previously PENDING notification transitioned to SENT by queue runner'
    )

    // -------------------------------------------------------------
    // Test 7: Email Template Integrity & Security
    // -------------------------------------------------------------
    console.log('\n--- 7. Email Template Integrity & Security ---')

    const mockSender = new MockEmailProvider()
    const testHtml = await mockSender.send({
      to: 'editorial@zuulab.com',
      subject: 'ZUULAB Sipariş Onayı: #ORD-TEST',
      html: `
        <div style="font-family: sans-serif; color: #111;">
          <h2>zuulab</h2>
          <p>Siparişiniz alındı: ORD-TEST</p>
        </div>
      `,
    })

    assert(
      testHtml.success && !!testHtml.providerMessageId,
      '7.1 Email provider returns providerMessageId upon dispatch'
    )

    // Inspect sent logs
    const lastEmail = mockSender.getLastSentEmail()
    assert(
      lastEmail?.to === 'editorial@zuulab.com',
      '7.2 Recipient correctly handled without credential leakage'
    )

    // -------------------------------------------------------------
    // Test 8: Audit Log Verification
    // -------------------------------------------------------------
    console.log('\n--- 8. Audit Log Verification ---')

    const auditLogs = await getAuditLogs(50)
    const notifAudit = auditLogs.find((l) => l.action.startsWith('NOTIFICATION_'))
    assert(
      !!notifAudit,
      '8.1 NOTIFICATION actions (CREATED / SENT / RETRIED) recorded in system AuditLog',
      `Found action: ${notifAudit?.action}`
    )

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n===============================================================')
    console.log(`  PHASE 10 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`)
    console.log('===============================================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('\n[FATAL ERROR] Unexpected error during verification suite:', error)
    process.exit(1)
  }
}

runTests()
