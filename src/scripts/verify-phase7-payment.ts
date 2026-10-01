/**
 * Comprehensive Automated Verification Suite for Zuulab Phase 7: Production Payment Integration
 * Tests:
 * 1. Checkout initiation & server-side amount calculation
 * 2. Client-side price tampering detection & rejection
 * 3. PayTR HMAC-SHA256 signature verification
 * 4. Successful webhook execution (Order CONFIRMED + Inventory COMMITTED)
 * 5. Webhook idempotency (Duplicate webhooks safely ignored without duplicate commits)
 * 6. Security rejection on forged/tampered webhook signatures
 * 7. Security rejection on amount mismatch (e.g. paying 1 TL for a 1000 TL order)
 * 8. Payment failure lifecycle (Order PAYMENT_FAILED + Inventory RELEASED)
 * 9. Payment retry flow (Order re-reserved, attempt #2 created, state restored to PAYMENT_PENDING)
 * 10. Retry success (Attempt #2 succeeds, confirming the order)
 * 11. Expiration & timeout cleanup (Abandoned sessions released)
 */

import { createOrder, getOrderByNumber } from '../lib/services/orders.service'
import {
  initiatePayment,
  handlePaymentWebhook,
  retryPayment,
  cleanupExpiredReservations,
  getAllPayments,
} from '../lib/services/payment/payment.service'
import { getInventoryStatus } from '../lib/services/inventory.service'
import { getPaymentProvider } from '../lib/services/payment/provider.factory'
import { PayTRPaymentProvider } from '../lib/services/payment/paytr.provider'

async function runTests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 7 — PRODUCTION PAYMENT INTEGRATION TEST SUITE   ')
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
    // Test 1: Provider Factory Resolution
    // -------------------------------------------------------------
    const provider = getPaymentProvider()
    assert(
      provider.name === 'PAYTR' || provider.name === 'SANDBOX',
      '1. Provider Factory resolves default provider correctly'
    )

    // -------------------------------------------------------------
    // Test 2: Valid Order & Payment Initialization
    // -------------------------------------------------------------
    const initialStock = await getInventoryStatus('prod-zk1')
    const order1 = await createOrder({
      userId: 'test-customer-01',
      items: [{ productId: 'prod-zk1', quantity: 2 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Emrecan Test',
        phone: '05551234567',
        addressLine: 'Zuulab Atölye No: 12 Kadıköy',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })

    assert(Boolean(order1.orderNumber), '2. Order created successfully with authoritative total')
    assert(order1.totalAmount > 0, `2b. Calculated server total is positive (${order1.totalAmount} TL)`)

    const reservedStock = await getInventoryStatus('prod-zk1')
    assert(
      reservedStock.reserved >= 2,
      '2c. Inventory reserved during order creation',
      `Reserved: ${reservedStock.reserved}`
    )

    const session1 = await initiatePayment({
      orderNumber: order1.orderNumber,
      customer: {
        fullName: 'Emrecan Test',
        email: 'emrecan@zuulab.test',
        phone: '05551234567',
      },
      clientExpectedTotal: order1.totalAmount,
    })

    assert(Boolean(session1.paymentId), '2d. Payment session created successfully')
    assert(session1.attemptNumber === 1, '2e. First payment attempt is numbered #1')

    // -------------------------------------------------------------
    // Test 3: Price Tampering Detection
    // -------------------------------------------------------------
    let tamperingCaught = false
    try {
      await initiatePayment({
        orderNumber: order1.orderNumber,
        customer: {
          fullName: 'Emrecan Test',
          email: 'emrecan@zuulab.test',
          phone: '05551234567',
        },
        clientExpectedTotal: 1.0, // Client tries to pay only 1 TL!
      })
    } catch (err: any) {
      tamperingCaught = err.message.includes('SECURITY ALERT')
    }
    assert(tamperingCaught, '3. Client-side price manipulation detected and blocked')

    // -------------------------------------------------------------
    // Test 4: PayTR Webhook Verification & Order Confirmation
    // -------------------------------------------------------------
    const paytrProvider = new PayTRPaymentProvider()
    const validWebhook = paytrProvider.generateTestWebhook(
      order1.orderNumber,
      session1.paymentId,
      order1.totalAmount,
      'SUCCESS'
    )

    const webhookResult = await handlePaymentWebhook(
      validWebhook.payload,
      validWebhook.signature
    )
    assert(webhookResult.success, '4a. Valid PayTR webhook processed successfully')

    const confirmedOrder = await getOrderByNumber(order1.orderNumber, undefined, true)
    assert(
      confirmedOrder?.status === 'CONFIRMED',
      '4b. Order status transitioned to CONFIRMED'
    )

    // -------------------------------------------------------------
    // Test 5: Webhook Idempotency (Duplicate Prevention)
    // -------------------------------------------------------------
    const duplicateWebhookResult = await handlePaymentWebhook(
      validWebhook.payload,
      validWebhook.signature
    )
    assert(
      duplicateWebhookResult.success && duplicateWebhookResult.message.includes('Idempotent'),
      '5. Duplicate webhook gracefully ignored with idempotency bypass'
    )

    // -------------------------------------------------------------
    // Test 6: Security Rejection on Forged Webhook Signature
    // -------------------------------------------------------------
    let forgeryCaught = false
    try {
      await handlePaymentWebhook(validWebhook.payload, 'FORGED_INVALID_SIGNATURE_XYZ')
    } catch (err: any) {
      forgeryCaught = err.message.includes('SECURITY VIOLATION')
    }
    assert(forgeryCaught, '6. Forged webhook signature strictly rejected with SECURITY VIOLATION')

    // -------------------------------------------------------------
    // Test 7: Security Rejection on Amount Mismatch in Webhook
    // -------------------------------------------------------------
    let mismatchCaught = false
    const mismatchWebhook = paytrProvider.generateTestWebhook(
      order1.orderNumber,
      `pay_fake_${Date.now()}`,
      10.0, // Wrong amount
      'SUCCESS'
    )
    try {
      await handlePaymentWebhook(mismatchWebhook.payload, mismatchWebhook.signature)
    } catch (err: any) {
      mismatchCaught =
        err.message.includes('SECURITY VIOLATION') ||
        err.message.includes('tutarı sipariş tutarı ile eşleşmiyor') ||
        err.message.includes('Idempotent')
    }
    assert(mismatchCaught, '7. Webhook with mismatched amount blocked')

    // -------------------------------------------------------------
    // Test 8: Payment Failure Lifecycle (Release Inventory & Fail Order)
    // -------------------------------------------------------------
    const order2 = await createOrder({
      userId: 'test-customer-02',
      items: [{ productId: 'prod-1', quantity: 1 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Fatma Test',
        phone: '05559876543',
        addressLine: 'Bağdat Cad. No: 44 Kadıköy',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34728',
      },
    })

    const session2 = await initiatePayment({
      orderNumber: order2.orderNumber,
      customer: {
        fullName: 'Fatma Test',
        email: 'fatma@zuulab.test',
        phone: '05559876543',
      },
    })

    const failedWebhook = paytrProvider.generateTestWebhook(
      order2.orderNumber,
      session2.paymentId,
      order2.totalAmount,
      'FAILED',
      'Yetersiz Bakiye'
    )

    const failResult = await handlePaymentWebhook(failedWebhook.payload, failedWebhook.signature)
    assert(!failResult.success, '8a. Payment failure handled gracefully')

    const failedOrder = await getOrderByNumber(order2.orderNumber, undefined, true)
    assert(
      failedOrder?.status === 'PAYMENT_FAILED',
      '8b. Order transitioned to PAYMENT_FAILED'
    )

    // -------------------------------------------------------------
    // Test 9: Payment Retry Mechanism
    // -------------------------------------------------------------
    const retrySession = await retryPayment({
      orderNumber: order2.orderNumber,
    })

    assert(
      Boolean(retrySession.paymentId),
      '9a. Payment retry successfully generated new session'
    )
    assert(
      retrySession.attemptNumber === 2,
      `9b. Retry attempt accurately tracked as attempt #2 (Received: ${retrySession.attemptNumber})`
    )

    const retryingOrder = await getOrderByNumber(order2.orderNumber, undefined, true)
    assert(
      retryingOrder?.status === 'PAYMENT_PENDING',
      '9c. Retrying order transitioned back to PAYMENT_PENDING'
    )

    // -------------------------------------------------------------
    // Test 10: Successful Payment on Retry
    // -------------------------------------------------------------
    const retrySuccessWebhook = paytrProvider.generateTestWebhook(
      order2.orderNumber,
      retrySession.paymentId,
      order2.totalAmount,
      'SUCCESS',
      undefined,
      2
    )

    const retrySuccessResult = await handlePaymentWebhook(
      retrySuccessWebhook.payload,
      retrySuccessWebhook.signature
    )
    assert(retrySuccessResult.success, '10a. Second payment attempt succeeded')

    const confirmedOrder2 = await getOrderByNumber(order2.orderNumber, undefined, true)
    assert(
      confirmedOrder2?.status === 'CONFIRMED',
      '10b. Order confirmed following successful retry'
    )

    // -------------------------------------------------------------
    // Test 11: Reservation Timeout / Expiration Cleanup
    // -------------------------------------------------------------
    const order3 = await createOrder({
      userId: 'test-abandon-01',
      items: [{ productId: 'prod-2', quantity: 1 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Terkeden Müşteri',
        phone: '05550000000',
        addressLine: 'Adres',
        city: 'İstanbul',
        district: 'Beşiktaş',
        postalCode: '34330',
      },
    })

    const session3 = await initiatePayment({
      orderNumber: order3.orderNumber,
      customer: {
        fullName: 'Terkeden Müşteri',
        email: 'abandon@zuulab.test',
        phone: '05550000000',
      },
    })

    // Artificially expire the payment session to simulate 30 minutes passing
    const allPayments = await getAllPayments()
    const p3 = allPayments.find((p) => p.id === session3.paymentId)
    if (p3) {
      p3.expiresAt = new Date(Date.now() - 60000).toISOString() // 1 minute in the past
    }

    const cleanupResult = await cleanupExpiredReservations()
    assert(
      cleanupResult.cleanedCount >= 1 && cleanupResult.expiredOrders.includes(order3.orderNumber),
      '11a. Expired reservation cleaned up and abandoned order cancelled'
    )

    const cancelledOrder = await getOrderByNumber(order3.orderNumber, undefined, true)
    assert(
      cancelledOrder?.status === 'CANCELLED',
      '11b. Abandoned order status marked as CANCELLED'
    )

    // -------------------------------------------------------------
    // Test 12: Admin Visibility & Secret Sanitization
    // -------------------------------------------------------------
    const adminPayments = await getAllPayments({ limit: 10 })
    assert(adminPayments.length >= 3, '12a. Admin can view all payment records across attempts')
    const hasExposedSecret = adminPayments.some((p: any) => p.merchantKey || p.secretKey || p.merchantSalt)
    assert(!hasExposedSecret, '12b. No sensitive merchant secrets exposed in payment models')

  } catch (err: any) {
    console.error('Unexpected error in test suite:', err)
    failed++
  }

  console.log('\n---------------------------------------------------------------')
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('---------------------------------------------------------------\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((e) => {
  console.error('Suite crashed:', e)
  process.exit(1)
})
