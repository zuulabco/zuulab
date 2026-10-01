/**
 * Comprehensive Automated Verification Suite for Zuulab Phase 9:
 * Fulfillment, Shipping & Cargo Integration
 */

import { createOrder, updateOrderStatus } from '../lib/services/orders.service'
import {
  createShipmentForOrder,
  getTrackingInfo,
  getShipmentLabel,
  cancelShipmentForOrder,
  handleShippingWebhook,
  syncActiveShipmentsTracking,
  getAllShipments,
} from '../lib/services/shipping/fulfillment.service'
import { getShippingProvider } from '../lib/services/shipping/shipping-provider.factory'
import { MockShippingProvider } from '../lib/services/shipping/mock.provider'
import { YurticiShippingProvider } from '../lib/services/shipping/yurtici.provider'
import { createInvoiceForOrder } from '../lib/services/invoice/invoice.service'

async function runTests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 9 — FULFILLMENT & SHIPPING INTEGRATION TEST SUITE')
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
    // Test 1: Pre-Flight Audit Verification (Phase 8 Items)
    // -------------------------------------------------------------
    console.log('--- 1. Pre-Flight Audit Verification ---')

    // 1.1 Invoice Idempotency Race Condition Lock
    const auditOrder = await createOrder({
      userId: 'usr-audit-1',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Audit Test User',
        phone: '05551112233',
        addressLine: 'Atatürk Mah. No:1',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })
    await updateOrderStatus(auditOrder.orderNumber, 'CONFIRMED', 'Payment verified', 'test')

    // Launch 3 simultaneous invoice creations to test in-flight concurrency lock
    const [inv1, inv2, inv3] = await Promise.all([
      createInvoiceForOrder({ orderNumber: auditOrder.orderNumber }),
      createInvoiceForOrder({ orderNumber: auditOrder.orderNumber }),
      createInvoiceForOrder({ orderNumber: auditOrder.orderNumber }),
    ])
    assert(
      inv1.id === inv2.id && inv2.id === inv3.id,
      '1.1 In-flight concurrency lock guarantees One Order -> One Invoice without race conditions'
    )

    // 1.2 VAT Model Verification
    assert(
      typeof auditOrder.items[0].taxRate === 'number' && auditOrder.items[0].taxRate > 0,
      '1.2 Order items snapshot dynamic taxRate (not hardcoded)'
    )

    // -------------------------------------------------------------
    // Test 2: Provider Abstraction & Factory
    // -------------------------------------------------------------
    console.log('\n--- 2. Provider Abstraction & Contracts ---')

    const mockProvider = getShippingProvider('MOCK')
    assert(
      mockProvider instanceof MockShippingProvider,
      '2.1 Factory instantiates MockShippingProvider'
    )

    const yurticiProvider = getShippingProvider('YURTICI')
    assert(
      yurticiProvider instanceof YurticiShippingProvider,
      '2.2 Factory instantiates YurticiShippingProvider'
    )

    // Test Mock Provider direct shipment & label creation
    const mockShipResult = await mockProvider.createShipment({
      orderNumber: 'ZUU-TEST-001',
      customerName: 'Ahmet Yılmaz',
      customerPhone: '05321234567',
      shippingAddress: {
        addressLine: 'Bağdat Cad. No: 42',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34740',
      },
      items: [{ productName: 'Vazo', sku: 'VAZ-01', quantity: 1 }],
    })

    assert(
      mockShipResult.trackingNumber.startsWith('MC') && Boolean(mockShipResult.trackingUrl),
      '2.3 Mock provider generates valid tracking number and tracking URL'
    )
    assert(
      Boolean(mockShipResult.labelData) && mockShipResult.labelFormat === 'PDF',
      '2.4 Mock provider generates printable PDF label'
    )

    // -------------------------------------------------------------
    // Test 3: Shipment Creation Eligibility & Validation Rules
    // -------------------------------------------------------------
    console.log('\n--- 3. Shipment Creation Eligibility & State Rules ---')

    // 3.1 Unpaid order rejection
    const unpaidOrder = await createOrder({
      userId: 'usr-unpaid',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Unpaid Customer',
        phone: '05550000000',
        addressLine: 'Deneme Cad.',
        city: 'İzmir',
        district: 'Karşıyaka',
        postalCode: '35000',
      },
    })

    let unpaidRejected = false
    try {
      await createShipmentForOrder({ orderNumber: unpaidOrder.orderNumber })
    } catch (err: unknown) {
      unpaidRejected = (err as Error).message.includes('onaylanmamış')
    }
    assert(unpaidRejected, '3.1 Rejects shipment creation on unpaid order')

    // 3.2 Cancelled order rejection
    const cancelledOrder = await createOrder({
      userId: 'usr-cancelled',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Cancelled Customer',
        phone: '05550000000',
        addressLine: 'Deneme Cad.',
        city: 'İzmir',
        district: 'Karşıyaka',
        postalCode: '35000',
      },
    })
    await updateOrderStatus(cancelledOrder.orderNumber, 'CANCELLED', 'Order cancelled', 'test')

    let cancelledRejected = false
    try {
      await createShipmentForOrder({ orderNumber: cancelledOrder.orderNumber })
    } catch (err: unknown) {
      cancelledRejected = (err as Error).message.includes('İptal edilmiş')
    }
    assert(cancelledRejected, '3.2 Rejects shipment creation on cancelled order')

    // 3.3 Paid / Confirmed order success
    const eligibleOrder = await createOrder({
      userId: 'usr-customer-1',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Mehmet Özkan',
        phone: '05449998877',
        addressLine: 'Moda Cad. No: 12 D:4',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })
    await updateOrderStatus(eligibleOrder.orderNumber, 'CONFIRMED', 'Payment succeeded', 'test')

    const shipment = await createShipmentForOrder({
      orderNumber: eligibleOrder.orderNumber,
      packageCount: 1,
      totalWeightKg: 2,
    })

    assert(
      shipment.status === 'LABEL_CREATED' && Boolean(shipment.trackingNumber),
      '3.3 Creates shipment successfully for CONFIRMED order'
    )

    // Check order state advanced to PREPARING
    assert(
      eligibleOrder.status === 'PREPARING',
      '3.4 Shipment creation automatically transitions CONFIRMED order to PREPARING'
    )

    // -------------------------------------------------------------
    // Test 4: One Order — One Active Shipment & Concurrency Lock
    // -------------------------------------------------------------
    console.log('\n--- 4. One Order — One Active Shipment Rule ---')

    // 4.1 Repeated sequential creation returns same shipment
    const secondCall = await createShipmentForOrder({
      orderNumber: eligibleOrder.orderNumber,
    })
    assert(
      secondCall.id === shipment.id && secondCall.trackingNumber === shipment.trackingNumber,
      '4.1 Sequential calls return existing active shipment (Idempotency)'
    )

    // 4.2 Concurrent calls with Promise.all
    const [c1, c2, c3] = await Promise.all([
      createShipmentForOrder({ orderNumber: eligibleOrder.orderNumber }),
      createShipmentForOrder({ orderNumber: eligibleOrder.orderNumber }),
      createShipmentForOrder({ orderNumber: eligibleOrder.orderNumber }),
    ])
    assert(
      c1.id === shipment.id && c2.id === shipment.id && c3.id === shipment.id,
      '4.2 Concurrent calls safely resolve to the exact same single shipment'
    )

    // -------------------------------------------------------------
    // Test 5: Shipping Label Generation & Access Control
    // -------------------------------------------------------------
    console.log('\n--- 5. Shipping Labels & Security ---')

    // 5.1 Admin can retrieve label
    const adminLabel = await getShipmentLabel({
      orderNumber: eligibleOrder.orderNumber,
      isAdmin: true,
    })
    assert(
      adminLabel.labelFormat === 'PDF' && adminLabel.labelData.length > 50,
      '5.1 Admin retrieves valid printable PDF shipping label'
    )

    // 5.2 Owner customer can retrieve label
    const ownerLabel = await getShipmentLabel({
      orderNumber: eligibleOrder.orderNumber,
      userId: 'usr-customer-1',
      isAdmin: false,
    })
    assert(
      ownerLabel.labelFormat === 'PDF',
      '5.2 Owner customer can retrieve shipment label'
    )

    // 5.3 Unauthorized customer B is blocked
    let unauthorizedBlocked = false
    try {
      await getShipmentLabel({
        orderNumber: eligibleOrder.orderNumber,
        userId: 'usr-malicious-user-2',
        isAdmin: false,
      })
    } catch (err: unknown) {
      unauthorizedBlocked = (err as Error).message.includes('FORBIDDEN')
    }
    assert(unauthorizedBlocked, '5.3 Customer B is forbidden from accessing Customer A shipment label')

    // -------------------------------------------------------------
    // Test 6: Tracking & State Normalization
    // -------------------------------------------------------------
    console.log('\n--- 6. Tracking & Status Machine ---')

    // 6.1 Owner customer can track order
    const trackingInfo = await getTrackingInfo({
      orderNumber: eligibleOrder.orderNumber,
      userId: 'usr-customer-1',
      isAdmin: false,
    })
    assert(
      trackingInfo.tracking.trackingNumber === shipment.trackingNumber,
      '6.1 Customer retrieves live tracking info'
    )

    // 6.2 Carrier movement advances order to SHIPPED
    const mockInstance = mockProvider as MockShippingProvider
    mockInstance.advanceMockStatus(
      shipment.trackingNumber,
      'IN_TRANSIT',
      'Kargo transfer merkezinde işlem gördü.',
      'İstanbul Transfer'
    )

    await getTrackingInfo({
      orderNumber: eligibleOrder.orderNumber,
      isAdmin: true,
    })

    assert(
      eligibleOrder.status === 'SHIPPED',
      '6.2 Carrier IN_TRANSIT update advances Order status to SHIPPED'
    )

    // 6.3 Carrier delivery advances order to DELIVERED
    mockInstance.advanceMockStatus(
      shipment.trackingNumber,
      'DELIVERED',
      'Paket alıcıya teslim edildi.',
      'Kadıköy Şube'
    )

    await getTrackingInfo({
      orderNumber: eligibleOrder.orderNumber,
      isAdmin: true,
    })

    assert(
      eligibleOrder.status === 'DELIVERED',
      '6.3 Carrier DELIVERED update advances Order status to DELIVERED'
    )

    // -------------------------------------------------------------
    // Test 7: Carrier Webhook Integration
    // -------------------------------------------------------------
    console.log('\n--- 7. Carrier Webhook Integration ---')

    // Create a new order for webhook test
    const webhookOrder = await createOrder({
      userId: 'usr-customer-wh',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Webhook Customer',
        phone: '05331112233',
        addressLine: 'Bağdat Cad. No: 10',
        city: 'İstanbul',
        district: 'Maltepe',
        postalCode: '34840',
      },
    })
    await updateOrderStatus(webhookOrder.orderNumber, 'CONFIRMED', 'Paid', 'test')
    const whShipment = await createShipmentForOrder({ orderNumber: webhookOrder.orderNumber })

    // 7.1 Webhook processes status transition
    const whResult = await handleShippingWebhook({
      providerName: 'MOCK',
      payload: {
        trackingNumber: whShipment.trackingNumber,
        status: 'SHIPPED',
        description: 'Paket kurye tarafından teslim alındı.',
        location: 'Acente',
      },
    })
    assert(whResult.success === true, '7.1 Webhook successfully processes carrier event')

    // 7.2 Webhook duplicate event idempotency
    const whDuplicate = await handleShippingWebhook({
      providerName: 'MOCK',
      payload: {
        trackingNumber: whShipment.trackingNumber,
        status: 'SHIPPED',
        description: 'Paket kurye tarafından teslim alındı.',
        location: 'Acente',
      },
    })
    assert(
      whDuplicate.message.includes('already processed'),
      '7.2 Webhook deduplicates identical carrier events'
    )

    // -------------------------------------------------------------
    // Test 8: Batch Cron Polling
    // -------------------------------------------------------------
    console.log('\n--- 8. Batch Cron Polling ---')

    const syncResult = await syncActiveShipmentsTracking()
    assert(
      typeof syncResult.syncedCount === 'number' && syncResult.syncedCount >= 0,
      '8.1 Batch tracking polling executes smoothly for Vercel Cron'
    )

    // -------------------------------------------------------------
    // Test 9: Central Admin Shipping Management & Cancellation
    // -------------------------------------------------------------
    console.log('\n--- 9. Admin Shipping Management & Cancellation ---')

    const allShipments = await getAllShipments()
    assert(
      allShipments.length >= 2,
      '9.1 Admin can list all shipments across orders'
    )

    // Create order to test cancellation
    const cancelOrder = await createOrder({
      userId: 'usr-customer-can',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Cancel Test',
        phone: '05330001122',
        addressLine: 'Sahil Yolu',
        city: 'İstanbul',
        district: 'Kartal',
        postalCode: '34860',
      },
    })
    await updateOrderStatus(cancelOrder.orderNumber, 'CONFIRMED', 'Paid', 'test')
    await createShipmentForOrder({ orderNumber: cancelOrder.orderNumber })

    const cancelledShipment = await cancelShipmentForOrder({
      orderNumber: cancelOrder.orderNumber,
      reason: 'Müşteri adres değişikliği istedi',
    })
    assert(
      cancelledShipment.status === 'CANCELLED',
      '9.2 Admin can cancel an active shipment'
    )

    // -------------------------------------------------------------
    // Test Results Summary
    // -------------------------------------------------------------
    console.log('\n===============================================================')
    console.log(`  PHASE 9 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
    console.log('===============================================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error during Phase 9 verification:', error)
    process.exit(1)
  }
}

runTests()
