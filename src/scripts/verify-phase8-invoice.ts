/**
 * Comprehensive Automated Verification Suite for Zuulab Phase 8:
 * Uyumsoft e-Fatura / e-Arşiv Integration
 */

import { createOrder, updateOrderStatus } from '../lib/services/orders.service'
import {
  createInvoiceForOrder,
  retryInvoiceForOrder,
  syncInvoiceStatus,
  getInvoiceDocument,
  getInvoiceByOrderNumber,
  getAllInvoices,
} from '../lib/services/invoice/invoice.service'
import { setCustomInvoiceProvider } from '../lib/services/invoice/invoice-provider.factory'
import { MockInvoiceProvider } from '../lib/services/invoice/mock.provider'
import { UyumsoftClient } from '../lib/services/invoice/uyumsoft.client'

async function runTests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 8 — UYUMSOFT E-FATURA / E-ARŞİV TEST SUITE       ')
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
    // Test 1: Uyumsoft Client & WSDL Contract Initialization
    // -------------------------------------------------------------
    const uyumsoftClient = new UyumsoftClient({ env: 'TEST' })
    assert(
      uyumsoftClient.activeEndpoint.includes('efatura-test.uyumsoft.com.tr'),
      '1a. Uyumsoft Client configured with official test endpoint'
    )

    const isEInvUserSimulation = await uyumsoftClient.isEInvoiceUser('9876543210')
    assert(
      isEInvUserSimulation === true,
      '1b. IsEInvoiceUser identifies corporate e-Invoice taxpayer'
    )

    const isRetailConsumer = await uyumsoftClient.isEInvoiceUser('11111111111')
    assert(
      isRetailConsumer === false,
      '1c. IsEInvoiceUser identifies standard consumer (e-Arşiv scenario)'
    )

    // Set up mock provider for deterministic business logic & security tests
    const mockProvider = new MockInvoiceProvider()
    setCustomInvoiceProvider(mockProvider)

    // -------------------------------------------------------------
    // Test 2: Unpaid Order Rejection (Payment != SUCCEEDED)
    // -------------------------------------------------------------
    const unpaidOrder = await createOrder({
      userId: 'customer-test-01',
      items: [{ productId: 'prod-zk1', quantity: 1 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Ahmet Yılmaz',
        phone: '05551112233',
        addressLine: 'Zuulab Sanat Atölyesi No: 4',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })

    let unpaidRejected = false
    try {
      await createInvoiceForOrder({ orderNumber: unpaidOrder.orderNumber })
    } catch (err: any) {
      unpaidRejected = err.message.includes('Ödemesi tamamlanmamış sipariş için fatura oluşturulamaz')
    }
    assert(
      unpaidRejected,
      '2. Invoice creation for unpaid order (PAYMENT_PENDING) strictly blocked'
    )

    // Transition order to CONFIRMED (simulating successful payment)
    await updateOrderStatus(unpaidOrder.orderNumber, 'CONFIRMED', 'Ödeme tamamlandı test onayı')

    // -------------------------------------------------------------
    // Test 3: Individual Customer Invoice (e-Arşiv)
    // -------------------------------------------------------------
    const individualInvoice = await createInvoiceForOrder({
      orderNumber: unpaidOrder.orderNumber,
      requestedBy: 'admin@zuulab.com',
    })

    assert(Boolean(individualInvoice.id), '3a. Invoice record created')
    assert(
      individualInvoice.invoiceType === 'E_ARSIV',
      `3b. Retail consumer assigned e-Arşiv (Received: ${individualInvoice.invoiceType})`
    )
    assert(
      individualInvoice.status === 'ISSUED',
      '3c. Invoice status is ISSUED'
    )
    assert(
      Boolean(individualInvoice.invoiceNumber?.startsWith('EAR2026')),
      `3d. e-Arşiv invoice number formatted correctly (${individualInvoice.invoiceNumber})`
    )
    assert(
      individualInvoice.totalAmount === unpaidOrder.totalAmount,
      '3e. Invoice total matches server-side order total'
    )

    // -------------------------------------------------------------
    // Test 4: Idempotency (Duplicate Invoice Prevention)
    // -------------------------------------------------------------
    const duplicateInvoice = await createInvoiceForOrder({
      orderNumber: unpaidOrder.orderNumber,
      requestedBy: 'admin@zuulab.com',
    })

    assert(
      duplicateInvoice.id === individualInvoice.id &&
      duplicateInvoice.invoiceNumber === individualInvoice.invoiceNumber,
      '4. Duplicate invoice creation call safely returns existing invoice (Idempotency)'
    )

    // -------------------------------------------------------------
    // Test 5: Corporate Customer Invoice (e-Fatura)
    // -------------------------------------------------------------
    const corporateOrder = await createOrder({
      userId: 'customer-corp-01',
      items: [{ productId: 'prod-1', quantity: 2 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Mehmet Özkan',
        phone: '05553334455',
        addressLine: 'Teknopark Plaza Kat: 4',
        city: 'İstanbul',
        district: 'Pendik',
        postalCode: '34906',
      },
      billingSameAsShipping: false,
      billingAddress: {
        fullName: 'Mehmet Özkan',
        phone: '05553334455',
        addressLine: 'Teknopark Plaza Kat: 4',
        city: 'İstanbul',
        district: 'Pendik',
        postalCode: '34906',
        companyName: 'Zuulab Teknoloji A.Ş.',
        taxOffice: 'Pendik V.D.',
        taxNumber: '9876543210',
      },
    })

    await updateOrderStatus(corporateOrder.orderNumber, 'CONFIRMED', 'Ödeme onaylandı')

    const corporateInvoice = await createInvoiceForOrder({
      orderNumber: corporateOrder.orderNumber,
      requestedBy: 'admin@zuulab.com',
    })

    assert(
      corporateInvoice.invoiceType === 'E_FATURA',
      `5a. Corporate customer assigned e-Fatura (Received: ${corporateInvoice.invoiceType})`
    )
    assert(
      Boolean(corporateInvoice.invoiceNumber?.startsWith('ZUU2026')),
      `5b. e-Fatura number prefixed with company series (${corporateInvoice.invoiceNumber})`
    )
    assert(
      corporateInvoice.billingSnapshot.companyName === 'Zuulab Teknoloji A.Ş.',
      '5c. Historical billing company name preserved in snapshot'
    )

    // -------------------------------------------------------------
    // Test 6: Provider Failure Handling & Retry Lifecycle
    // -------------------------------------------------------------
    const failOrder = await createOrder({
      userId: 'customer-fail-01',
      items: [{ productId: 'prod-2', quantity: 1 }],
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Zeynep Kaya',
        phone: '05557778899',
        addressLine: 'Atatürk Bulvarı No: 55',
        city: 'Ankara',
        district: 'Çankaya',
        postalCode: '06690',
      },
    })
    await updateOrderStatus(failOrder.orderNumber, 'CONFIRMED', 'Ödeme onaylandı')

    // Simulate temporary provider failure
    mockProvider.simulateFailure = true
    mockProvider.failureMessage = 'Uyumsoft GIB Bağlantı Zaman Aşımı'

    let failCaught = false
    try {
      await createInvoiceForOrder({ orderNumber: failOrder.orderNumber })
    } catch (err: any) {
      failCaught = err.message.includes('Uyumsoft GIB Bağlantı Zaman Aşımı')
    }
    assert(failCaught, '6a. Provider failure handled and returned as error')

    const failedStoredInvoice = await getInvoiceByOrderNumber(failOrder.orderNumber)
    assert(
      failedStoredInvoice?.status === 'FAILED',
      '6b. Invoice record stored with status FAILED'
    )

    // Now restore provider and retry
    mockProvider.simulateFailure = false
    const retriedInvoice = await retryInvoiceForOrder({
      orderNumber: failOrder.orderNumber,
      requestedBy: 'admin@zuulab.com',
    })

    assert(
      retriedInvoice.status === 'ISSUED',
      '6c. Retry successfully issued the invoice'
    )
    assert(
      retriedInvoice.retryCount >= 1,
      `6d. Retry count incremented (Count: ${retriedInvoice.retryCount})`
    )

    // -------------------------------------------------------------
    // Test 7: Provider Status Synchronization
    // -------------------------------------------------------------
    const synced = await syncInvoiceStatus(failOrder.orderNumber)
    assert(
      synced.status === 'ISSUED',
      '7. Provider status synchronization completed successfully'
    )

    // -------------------------------------------------------------
    // Test 8: Document Access Security & Customer Data Isolation
    // -------------------------------------------------------------
    // 8a. Admin access
    const adminDoc = await getInvoiceDocument({
      orderNumber: unpaidOrder.orderNumber,
      isAdmin: true,
    })
    assert(Boolean(adminDoc.pdfData), '8a. Admin can retrieve invoice PDF document')

    // 8b. Authorized customer access (owner)
    const ownerDoc = await getInvoiceDocument({
      orderNumber: unpaidOrder.orderNumber,
      userId: unpaidOrder.userId,
      isAdmin: false,
    })
    assert(Boolean(ownerDoc.pdfData), '8b. Order owner can retrieve their own invoice PDF')

    // 8c. Unauthorized customer access (attacker)
    let attackBlocked = false
    try {
      await getInvoiceDocument({
        orderNumber: unpaidOrder.orderNumber,
        userId: 'attacker-customer-99',
        isAdmin: false,
      })
    } catch (err: any) {
      attackBlocked = err.message.includes('FORBIDDEN')
    }
    assert(
      attackBlocked,
      '8c. Customer B cannot access Customer A invoice PDF (Strict Isolation)'
    )

    // -------------------------------------------------------------
    // Test 9: Admin All Invoices Listing & Secret Sanitization
    // -------------------------------------------------------------
    const allInvoices = await getAllInvoices({ limit: 10 })
    assert(allInvoices.length >= 3, '9a. Admin can list all invoices')
    const hasSecretLeaked = allInvoices.some(
      (inv: any) => inv.password || inv.username || inv.secretKey
    )
    assert(!hasSecretLeaked, '9b. Zero credentials leaked in invoice records')

  } catch (err: any) {
    console.error('Unexpected error in Phase 8 test suite:', err)
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
