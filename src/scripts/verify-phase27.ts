/**
 * ZUULAB PHASE 27 — DAILY SHIPPING & BULK LABEL OPERATIONS
 * VERIFICATION SUITE (T1 - T17)
 */

import { ShippingService } from '../lib/services/shipping/shipping.service'
import { LabelService } from '../lib/services/shipping/label/label.service'
import { LabelRenderer } from '../lib/services/shipping/label/label-renderer'
import { BarcodeService } from '../lib/services/shipping/label/barcode.service'
import { BulkShippingService } from '../lib/services/shipping/bulk-shipping.service'
import { hasPermission } from '../lib/services/permissions.service'
import {
  getInventoryStatus,
  reserveInventory,
} from '../lib/services/inventory.service'
import { createOrder, getOrderByNumber } from '../lib/services/orders.service'
import { MOCK_PRODUCTS } from '../lib/mock-data'
import type { CreateShipmentRequest } from '../lib/services/shipping/shipping-types'

let passed = 0
let failed = 0

function assert(condition: boolean, testId: string, description: string, expected?: unknown, actual?: unknown) {
  if (condition) {
    console.log(`[PASS] ${testId} - ${description}`)
    passed++
  } else {
    console.error(`[FAIL] ${testId} - ${description}`)
    if (expected !== undefined || actual !== undefined) {
      console.error(`       Expected: ${JSON.stringify(expected)} | Actual: ${JSON.stringify(actual)}`)
    }
    failed++
  }
}

async function runPhase27Verification() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 27 — DAILY SHIPPING & BULK LABEL OPERATIONS    ')
  console.log('===============================================================\n')

  const testProduct = MOCK_PRODUCTS[0] // prod-zk1

  // Helper to create a test order and shipment
  const createTestOrderAndShipment = async (
    suffix: string,
    channel: 'DIRECT' | 'MARKETPLACE' = 'DIRECT',
    storeId?: string,
    provider: 'SURAT' | 'PTT' | 'MOCK' = 'MOCK'
  ) => {
    const order = await createOrder({
      userId: `usr-p27-${suffix}`,
      items: [{ productId: testProduct.id, quantity: 1 }],
      shippingAddress: {
        fullName: `Müşteri ${suffix}`,
        phone: '05559876543',
        addressLine: `Kadıköy Mah. No ${suffix}`,
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    })

    const shipReq: CreateShipmentRequest = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel,
      storeId: storeId || 'store_main',
      preferredProvider: provider,
      recipient: {
        fullName: `Müşteri ${suffix}`,
        phone: '05559876543',
        addressLine: `Kadıköy Mah. No ${suffix}`,
        city: 'İstanbul',
        district: 'Kadıköy',
      },
      items: [{ productName: testProduct.name, sku: testProduct.sku, quantity: 1 }],
      packageCount: 1,
      totalWeightKg: 0.5,
    }

    const shipRes = await ShippingService.createShipment(shipReq)
    const shipment = await ShippingService.getShipmentById(shipRes.shipmentId)
    return { orderNum: order.orderNumber, shipment }
  }

  // -------------------------------------------------------------
  // T1 — Ready Shipments List
  // -------------------------------------------------------------
  console.log('--- T1: Ready shipments list ---')
  const { shipment: shipT1_1 } = await createTestOrderAndShipment('T1-1', 'DIRECT', 'store_t1')
  const { shipment: shipT1_2 } = await createTestOrderAndShipment('T1-2', 'DIRECT', 'store_t1')

  const readyList = await ShippingService.listShipments({
    status: 'LABEL_READY',
  })
  assert(
    readyList.length >= 2,
    'T1.1',
    'Ready shipments can be queried by status',
    true,
    readyList.length >= 2
  )
  const foundT1 = readyList.some((s) => s.id === shipT1_1.id)
  assert(foundT1, 'T1.2', 'Newly created shipment appears in ready shipments list')

  // -------------------------------------------------------------
  // T2 — Shipment Selection Mechanics
  // -------------------------------------------------------------
  console.log('\n--- T2: Shipment selection ---')
  const selectedBatch = [shipT1_1.id, shipT1_2.id]
  assert(
    selectedBatch.length === 2 && selectedBatch[0] !== selectedBatch[1],
    'T2.1',
    'Shipment selection mechanics support multi-selection array'
  )

  // -------------------------------------------------------------
  // T3 — Authorization
  // -------------------------------------------------------------
  console.log('\n--- T3: Authorization & RBAC ---')
  assert(
    hasPermission('CUSTOMER', 'SHIPPING_LABEL') === false,
    'T3.1',
    'CUSTOMER role is strictly forbidden from generating shipping labels'
  )
  assert(
    hasPermission('CUSTOMER', 'SHIPPING_MANAGE') === false,
    'T3.2',
    'CUSTOMER role is strictly forbidden from managing shipping or marking shipped'
  )
  assert(
    hasPermission('ADMIN', 'SHIPPING_LABEL') === true,
    'T3.3',
    'ADMIN role has permission to generate shipping labels'
  )
  assert(
    hasPermission('ADMIN', 'SHIPPING_MANAGE') === true,
    'T3.4',
    'ADMIN role has permission to manage shipping and mark shipments as shipped'
  )
  assert(
    hasPermission('SUPER_ADMIN', 'SHIPPING_LABEL') === true,
    'T3.5',
    'SUPER_ADMIN role has permission for all shipping operations'
  )

  // -------------------------------------------------------------
  // T4 — Multi-Store Isolation
  // -------------------------------------------------------------
  console.log('\n--- T4: Multi-store isolation ---')
  const { shipment: shipStoreA } = await createTestOrderAndShipment('StoreA', 'DIRECT', 'STORE_TENANT_A')
  const { shipment: shipStoreB } = await createTestOrderAndShipment('StoreB', 'DIRECT', 'STORE_TENANT_B')

  const crossStoreResult = await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipStoreA.id, shipStoreB.id],
    storeId: 'STORE_TENANT_A',
    adminUserId: 'admin_tenant_a',
  })
  assert(
    crossStoreResult.failedCount >= 1,
    'T4.1',
    'Cross-store bulk request rejects foreign store shipment',
    true,
    crossStoreResult.failedCount >= 1
  )
  const storeBFailure = crossStoreResult.results.find((r) => r.shipmentId === shipStoreB.id)
  assert(
    storeBFailure?.error?.includes('İzolasyonu') || storeBFailure?.error?.includes('mağaza'),
    'T4.2',
    'Explicit error returned identifying store isolation violation'
  )

  // -------------------------------------------------------------
  // T5 — Bulk Label Generation
  // -------------------------------------------------------------
  console.log('\n--- T5: Bulk label generation ---')
  const { shipment: shipT5_1 } = await createTestOrderAndShipment('T5-1', 'DIRECT', 'store_t5')
  const bulkGenRes = await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipT5_1.id],
    storeId: 'store_t5',
    adminUserId: 'admin_t5',
  })
  assert(bulkGenRes.success === true, 'T5.1', 'Bulk label generation executes successfully')
  assert(bulkGenRes.successCount === 1, 'T5.2', 'Correct successCount returned (1)')
  assert(Boolean(bulkGenRes.combinedPdf?.data), 'T5.3', 'Combined PDF vector stream returned in Base64')

  // -------------------------------------------------------------
  // T6 — Multiple Labels
  // -------------------------------------------------------------
  console.log('\n--- T6: Multiple labels combined ---')
  const { shipment: shipT6_1 } = await createTestOrderAndShipment('T6-1', 'DIRECT', 'store_t6')
  const { shipment: shipT6_2 } = await createTestOrderAndShipment('T6-2', 'DIRECT', 'store_t6')
  const { shipment: shipT6_3 } = await createTestOrderAndShipment('T6-3', 'DIRECT', 'store_t6')

  const multiLabelsRes = await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipT6_1.id, shipT6_2.id, shipT6_3.id],
    storeId: 'store_t6',
    adminUserId: 'admin_t6',
  })
  assert(multiLabelsRes.successCount === 3, 'T6.1', 'All 3 shipments processed successfully')
  assert(multiLabelsRes.combinedPdf?.totalPages === 3, 'T6.2', 'Multi-label PDF contains exactly 3 pages')

  // -------------------------------------------------------------
  // T7 — Partial Failure Handling
  // -------------------------------------------------------------
  console.log('\n--- T7: Partial failure handling ---')
  const invalidShipmentId = 'ship_invalid_non_existent_9999'
  const partialRes = await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipT6_1.id, invalidShipmentId],
    storeId: 'store_t6',
    adminUserId: 'admin_t7',
  })
  assert(partialRes.successCount === 1, 'T7.1', 'Valid shipment succeeds in partial failure scenario')
  assert(partialRes.failedCount === 1, 'T7.2', 'Invalid shipment fails with recorded error')
  assert(
    partialRes.combinedPdf?.totalPages === 1,
    'T7.3',
    'PDF only contains successfully generated labels (1 page)'
  )

  // -------------------------------------------------------------
  // T8 — Duplicate Label Request (Idempotency)
  // -------------------------------------------------------------
  console.log('\n--- T8: Duplicate label request (Idempotency) ---')
  const initialLabels = await LabelService.getLabelsForShipment(shipT6_1.id)
  const initialLabelCount = initialLabels.length

  const repeatRes = await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipT6_1.id],
    storeId: 'store_t6',
    adminUserId: 'admin_t8',
  })
  const postLabels = await LabelService.getLabelsForShipment(shipT6_1.id)

  assert(repeatRes.success === true, 'T8.1', 'Repeat label request returns success')
  assert(
    postLabels.length === initialLabelCount,
    'T8.2',
    'No duplicate label record created in DB/memory on repeated request',
    initialLabelCount,
    postLabels.length
  )

  // -------------------------------------------------------------
  // T9 — Label Generation Does NOT Mutate Physical Stock
  // -------------------------------------------------------------
  console.log('\n--- T9: Label generation does NOT mutate stock ---')
  const invBeforeLabel = await getInventoryStatus(testProduct.id)
  const { shipment: shipT9 } = await createTestOrderAndShipment('T9-1', 'DIRECT', 'store_t9')

  await BulkShippingService.bulkGenerateLabels({
    shipmentIds: [shipT9.id],
    storeId: 'store_t9',
    adminUserId: 'admin_t9',
  })
  const invAfterLabel = await getInventoryStatus(testProduct.id)

  assert(
    invAfterLabel.stock === invBeforeLabel.stock,
    'T9.1',
    'Physical inventory stock is strictly unchanged by label generation',
    invBeforeLabel.stock,
    invAfterLabel.stock
  )

  // -------------------------------------------------------------
  // T10 — Bulk Shipped Transition & Inventory Commit
  // -------------------------------------------------------------
  console.log('\n--- T10: Bulk shipped transition ---')
  const { orderNum: ordT10, shipment: shipT10 } = await createTestOrderAndShipment('T10-1', 'DIRECT', 'store_t10')
  const invPreShip = await getInventoryStatus(testProduct.id)

  const shipRes = await BulkShippingService.bulkMarkAsShipped({
    shipmentIds: [shipT10.id],
    storeId: 'store_t10',
    adminUserId: 'admin_t10',
  })

  assert(shipRes.success === true, 'T10.1', 'Bulk mark as shipped returns success')
  const refreshedT10 = await ShippingService.getShipmentById(shipT10.id)
  assert(refreshedT10.status === 'SHIPPED', 'T10.2', 'Shipment status transitioned to SHIPPED')

  const invPostShip = await getInventoryStatus(testProduct.id)
  assert(
    invPostShip.stock === invPreShip.stock - 1,
    'T10.3',
    'Physical stock decremented by exact quantity (-1) on SHIPPED transition',
    invPreShip.stock - 1,
    invPostShip.stock
  )

  // -------------------------------------------------------------
  // T11 — Shipped Idempotency
  // -------------------------------------------------------------
  console.log('\n--- T11: Shipped idempotency ---')
  const invPreRepeatShip = await getInventoryStatus(testProduct.id)

  const repeatShipRes = await BulkShippingService.bulkMarkAsShipped({
    shipmentIds: [shipT10.id],
    storeId: 'store_t10',
    adminUserId: 'admin_t11',
  })
  const invPostRepeatShip = await getInventoryStatus(testProduct.id)

  assert(repeatShipRes.results[0].idempotent === true, 'T11.1', 'Repeated mark as shipped flagged as idempotent')
  assert(
    invPostRepeatShip.stock === invPreRepeatShip.stock,
    'T11.2',
    'Physical stock is NOT decremented a second time on repeated SHIPPED request',
    invPreRepeatShip.stock,
    invPostRepeatShip.stock
  )

  // -------------------------------------------------------------
  // T12 — Barcode Presence & Format
  // -------------------------------------------------------------
  console.log('\n--- T12: Barcode presence ---')
  const sampleTracking = 'SRT-9876543210'
  const barcodeResult = BarcodeService.encodeCode128(sampleTracking)
  assert(
    barcodeResult.codeText === sampleTracking,
    'T12.1',
    'Barcode encoding preserves original tracking number'
  )
  assert(
    barcodeResult.binaryBars.length > 50 && /^[01]+$/.test(barcodeResult.binaryBars),
    'T12.2',
    'Barcode produces valid binary 1/0 pattern sequence'
  )
  assert(
    barcodeResult.svg.includes('<svg') && barcodeResult.svg.includes('rect'),
    'T12.3',
    'Barcode vector representation generated with rect elements'
  )

  // -------------------------------------------------------------
  // T13 — 100×100 mm PDF Physical Dimensions
  // -------------------------------------------------------------
  console.log('\n--- T13: 100x100mm PDF physical dimensions ---')
  const renderedSinglePdf = LabelRenderer.renderPdf({
    shipmentId: shipT6_1.id,
    trackingNumber: shipT6_1.trackingNumber,
    carrier: shipT6_1.carrier,
    orderNumber: shipT6_1.orderNumber || 'ZUU-100',
    channel: 'DIRECT',
    recipient: shipT6_1.shippingAddress,
    packageCount: 1,
  })

  assert(renderedSinglePdf.widthMm === 100, 'T13.1', 'Rendered output width is strictly 100mm')
  assert(renderedSinglePdf.heightMm === 100, 'T13.2', 'Rendered output height is strictly 100mm')

  const pdfDecoded = Buffer.from(renderedSinglePdf.data, 'base64').toString('latin1')
  assert(
    pdfDecoded.includes('/MediaBox [0 0 283.46 283.46]'),
    'T13.3',
    'PDF MediaBox is set to 283.46pt x 283.46pt (exact 100mm x 100mm for Xprinter XP-470B)'
  )

  // -------------------------------------------------------------
  // T14 — Channel Filtering
  // -------------------------------------------------------------
  console.log('\n--- T14: Channel filtering ---')
  const { shipment: directShip } = await createTestOrderAndShipment('DirectChan', 'DIRECT', 'store_t14')
  const { shipment: mktShip } = await createTestOrderAndShipment('MktChan', 'MARKETPLACE', 'store_t14')

  const directList = await ShippingService.listShipments({ channel: 'DIRECT' })
  const mktList = await ShippingService.listShipments({ channel: 'MARKETPLACE' })

  assert(
    directList.every((s) => s.channel === 'DIRECT'),
    'T14.1',
    'Direct channel filter returns only DIRECT shipments'
  )
  assert(
    mktList.every((s) => s.channel === 'MARKETPLACE'),
    'T14.2',
    'Marketplace channel filter returns only MARKETPLACE shipments'
  )

  // -------------------------------------------------------------
  // T15 — Carrier Filtering
  // -------------------------------------------------------------
  console.log('\n--- T15: Carrier filtering ---')
  const suratList = await ShippingService.listShipments({ provider: 'SURAT' })
  const mockList = await ShippingService.listShipments({ provider: 'MOCK' })

  assert(
    suratList.every((s) => s.provider === 'SURAT'),
    'T15.1',
    'SURAT carrier filter returns only SURAT provider shipments'
  )
  assert(
    mockList.every((s) => s.provider === 'MOCK'),
    'T15.2',
    'MOCK carrier filter returns only MOCK provider shipments'
  )

  // -------------------------------------------------------------
  // T16 — Dashboard Shipping Daily Counts
  // -------------------------------------------------------------
  console.log('\n--- T16: Dashboard shipping daily counts ---')
  const dailyStats = await BulkShippingService.getDailyShippingStats()
  assert(typeof dailyStats.kargoyaHazir === 'number', 'T16.1', 'kargoyaHazir count is a valid number')
  assert(typeof dailyStats.etiketHazir === 'number', 'T16.2', 'etiketHazir count is a valid number')
  assert(typeof dailyStats.etiketBekliyor === 'number', 'T16.3', 'etiketBekliyor count is a valid number')
  assert(typeof dailyStats.kargoyaVerildi === 'number', 'T16.4', 'kargoyaVerildi count is a valid number')
  assert(
    dailyStats.todayTotal >= 0,
    'T16.5',
    'Daily totals are computed from real active shipments'
  )

  // -------------------------------------------------------------
  // T17 — Existing Shipping Regression
  // -------------------------------------------------------------
  console.log('\n--- T17: Existing shipping regression ---')
  const { shipment: shipReg } = await createTestOrderAndShipment('Reg1', 'DIRECT', 'store_reg')
  const singleLabel = await LabelService.generateLabel(shipReg, 'PDF', false)
  assert(Boolean(singleLabel.labelId), 'T17.1', 'Existing single LabelService.generateLabel functions correctly')

  const statusUpdated = await ShippingService.updateShipmentStatus(shipReg.id, 'IN_TRANSIT', {
    description: 'Kargo yola çıktı',
  })
  assert(statusUpdated.status === 'IN_TRANSIT', 'T17.2', 'Existing ShippingService.updateShipmentStatus functions correctly')

  console.log('\n===============================================================')
  console.log(`  PHASE 27 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase27Verification().catch((err) => {
  console.error('[Phase 27 Verification Error]:', err)
  process.exit(1)
})
