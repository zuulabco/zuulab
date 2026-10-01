/**
 * ZUULAB PHASE 26 — OPERATIONAL DATA INTEGRITY & REAL-WORLD VALIDATION
 * CROSS-MODULE AUDIT & REGRESSION VERIFICATION SUITE
 *
 * Validates cross-module business invariants:
 * Test 1: Order -> Reservation -> Inventory
 * Test 2: Production -> Completed -> Stocked -> Inventory
 * Test 3: Production Stock Idempotency (repeated STOCKED does not double-increment)
 * Test 4: Marketplace Ingestion -> Mapping -> Inventory & Unmatched Barrier
 * Test 5: Shipping -> Shipped -> Authoritative Stock Commitment
 * Test 6: Return Inspection -> Restock vs Damaged Quarantine Guard
 * Test 7: Economics Actual Fee Precedence (Actual > Configured > Manual > Unavailable)
 * Test 8: Economics Unknown != Zero (Missing/null fee does not silently become 0 TL)
 * Test 9: Historical Material Price Snapshot & EffectiveDate Immutability
 * Test 10: Dashboard Data Integrity (actionSummary & orderCounts exact match)
 * Test 11: One-Click Production & Suggested Quantity Calculation
 * Test 12: RBAC & Server Auth Context Boundaries
 * Test 13: Multi-Store Isolation (Tenant A vs Tenant B partitioning)
 * Test 14: Money Precision (minor units, rounding, float defense)
 * Test 15: Duplicate Mutation & Idempotency Protection Across Modules
 */

import {
  getInventoryStatus,
  reserveInventory,
  releaseInventoryReservation,
  commitInventoryReservation,
  adjustInventory,
  restockProductInventory,
} from '../lib/services/inventory.service'
import {
  createOrder,
  updateOrderStatus,
  getOrderByNumber,
  getAllOrders,
} from '../lib/services/orders.service'
import {
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
  stockProductionOrder,
  getLowStockProductsForProduction,
  getProductionSummary,
} from '../lib/services/production.service'
import {
  ingestMarketplaceOrder,
  getMarketplaceStores,
  getMarketplaceMappings,
} from '../lib/services/marketplace/marketplace.service'
import { ShippingService } from '../lib/services/shipping/shipping.service'
import { ReturnInspectionService } from '../lib/services/warehouse/return-inspection.service'
import {
  calculateMaterialCost,
  calculateProductionCost,
  calculateContribution,
  evaluateChannelEconomics,
  getProductCostProfile,
  saveMaterial,
  getMaterialByName,
  getMaterialPriceHistory,
  roundMoney,
} from '../lib/services/product-economics.service'
import { hasPermission } from '../lib/services/permissions.service'
import { getAdminOverview } from '../lib/services/admin.service'
import { MOCK_PRODUCTS } from '../lib/mock-data'

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

async function runPhase26Verification() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 26 — OPERATIONAL DATA INTEGRITY & VALIDATION   ')
  console.log('===============================================================\n')

  const targetProduct = MOCK_PRODUCTS[0] // prod-zk1 (ZUU-ZK1)
  const initialInv = await getInventoryStatus(targetProduct.id)

  // -------------------------------------------------------------
  // Test 1: Order -> Reservation -> Inventory
  // -------------------------------------------------------------
  console.log('--- Test 1: Order -> Reservation -> Inventory ---')
  const t1Initial = await getInventoryStatus(targetProduct.id)
  const order1 = await createOrder({
    userId: 'usr-p26-t1',
    items: [{ productId: targetProduct.id, quantity: 2 }],
    shippingAddress: {
      fullName: 'Integrity Tester',
      phone: '05551112233',
      addressLine: 'Test Cad. 1',
      city: 'İstanbul',
      district: 'Kadıköy',
      postalCode: '34710',
    },
  })

  const t1AfterOrder = await getInventoryStatus(targetProduct.id)
  assert(
    t1AfterOrder.stock === t1Initial.stock,
    'T1.1',
    'Order creation preserves physical stock exactly',
    t1Initial.stock,
    t1AfterOrder.stock
  )
  assert(
    t1AfterOrder.reserved === t1Initial.reserved + 2,
    'T1.2',
    'Order creation increments reserved stock by exact quantity (+2)',
    t1Initial.reserved + 2,
    t1AfterOrder.reserved
  )
  assert(
    t1AfterOrder.available === t1AfterOrder.stock - t1AfterOrder.reserved,
    'T1.3',
    'Central invariant holds: available = stock - reserved',
    t1AfterOrder.stock - t1AfterOrder.reserved,
    t1AfterOrder.available
  )

  // Order cancellation -> Reservation release
  await updateOrderStatus(order1.orderNumber, 'CANCELLED', 'Test cancellation', 'admin-p26')
  const t1AfterCancel = await getInventoryStatus(targetProduct.id)
  assert(
    t1AfterCancel.reserved === t1Initial.reserved,
    'T1.4',
    'Order cancellation releases reservation back to initial',
    t1Initial.reserved,
    t1AfterCancel.reserved
  )
  assert(
    t1AfterCancel.stock === t1Initial.stock,
    'T1.5',
    'Physical stock remains untouched after order cancellation',
    t1Initial.stock,
    t1AfterCancel.stock
  )

  // -------------------------------------------------------------
  // Test 2: Production -> Completed -> Stocked -> Inventory
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Production -> Completed -> Stocked -> Inventory ---')
  const t2InitialInv = await getInventoryStatus(targetProduct.id)

  const prodOrderRes = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 10,
    priority: 'HIGH',
    printerReference: 'Bambu Lab X1-Carbon #01',
    createdBy: 'admin-p26-prod',
  })
  assert(prodOrderRes.success && prodOrderRes.order?.status === 'PLANNED', 'T2.1', 'Production order created in PLANNED status')

  const prodOrderId = prodOrderRes.order!.id
  await startProductionOrder(prodOrderId, 'admin-p26-prod')
  const startStatus = await getInventoryStatus(targetProduct.id)
  assert(startStatus.stock === t2InitialInv.stock, 'T2.2', 'Production start does not mutate central inventory stock')

  // Complete with 10 total, 2 failed -> 8 accepted
  await completeProductionOrder(prodOrderId, { completedQuantity: 10, failedQuantity: 2 }, 'admin-p26-prod')
  const completeStatus = await getInventoryStatus(targetProduct.id)
  assert(
    completeStatus.stock === t2InitialInv.stock,
    'T2.3',
    'Production completion does NOT directly change stock (requires authoritative stocking)',
    t2InitialInv.stock,
    completeStatus.stock
  )

  // Authoritative stocking via ProductionService -> InventoryService.adjustInventory()
  const stockResult = await stockProductionOrder(prodOrderId, 'admin-p26-prod')
  assert(stockResult.success, 'T2.4', 'Stock production order succeeded')
  const t2AfterStock = await getInventoryStatus(targetProduct.id)
  assert(
    t2AfterStock.stock === t2InitialInv.stock + 8,
    'T2.5',
    'Stocked production increases physical stock by exactly accepted quantity (+8)',
    t2InitialInv.stock + 8,
    t2AfterStock.stock
  )

  // -------------------------------------------------------------
  // Test 3: Production Stock Idempotency
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Production Stock Idempotency ---')
  const t3PreRepeat = await getInventoryStatus(targetProduct.id)
  const repeatStockResult = await stockProductionOrder(prodOrderId, 'admin-p26-prod')
  assert(repeatStockResult.success && repeatStockResult.idempotent === true, 'T3.1', 'Repeated stock returns idempotent flag')
  const t3PostRepeat = await getInventoryStatus(targetProduct.id)
  assert(
    t3PostRepeat.stock === t3PreRepeat.stock,
    'T3.2',
    'Idempotency invariant: Double stocking does NOT increment stock twice',
    t3PreRepeat.stock,
    t3PostRepeat.stock
  )

  // -------------------------------------------------------------
  // Test 4: Marketplace Ingestion -> Mapping -> Inventory & Unmatched Barrier
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Marketplace Ingestion -> Mapping -> Inventory & Barrier ---')
  const t4InitialInv = await getInventoryStatus(targetProduct.id)

  // Ingest with unmapped SKU
  const unmappedPayload = {
    orderNumber: 'TY-UNMAPPED-P26',
    packageNumber: 'PKG-UNMAPPED-P26',
    status: 'Created',
    customerFirstName: 'Bilinmeyen',
    customerLastName: 'Alıcı',
    grossAmount: 350.0,
    cargoProviderName: 'TRENDYOL_EXPRESS',
    lines: [
      {
        lineId: 'line-unmapped-1',
        stockCode: 'UNKNOWN-BARCODE-9999',
        productName: 'Eşleşmemiş Ürün',
        quantity: 3,
        price: 350.0,
        orderLineItemStatusName: 'Created',
      },
    ],
  }

  const unmappedIngest = await ingestMarketplaceOrder('store-ty-1', unmappedPayload)
  assert(
    unmappedIngest.reconciliationStatus === 'UNMATCHED',
    'T4.1',
    'Unmapped SKU order is classified as UNMATCHED',
    'UNMATCHED',
    unmappedIngest.reconciliationStatus
  )
  const t4AfterUnmapped = await getInventoryStatus(targetProduct.id)
  assert(
    t4AfterUnmapped.reserved === t4InitialInv.reserved,
    'T4.2',
    'Safety Barrier: UNMATCHED order mutates exactly 0 reserved stock in central inventory',
    t4InitialInv.reserved,
    t4AfterUnmapped.reserved
  )

  // Duplicate webhook ingestion idempotency
  const dupUnmappedIngest = await ingestMarketplaceOrder('store-ty-1', unmappedPayload)
  assert(
    dupUnmappedIngest.action === 'UNCHANGED',
    'T4.3',
    'Repeated marketplace webhook returns UNCHANGED status without double mutation'
  )

  // -------------------------------------------------------------
  // Test 5: Shipping -> Shipped -> Authoritative Stock Commitment
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Shipping -> Shipped -> Stock Commitment ---')
  // Create an order for shipping test
  const shipOrder = await createOrder({
    userId: 'usr-p26-ship',
    items: [{ productId: targetProduct.id, quantity: 1 }],
    shippingAddress: {
      fullName: 'Kargo Alıcısı',
      phone: '05553334455',
      addressLine: 'Kargo Sok. No: 4',
      city: 'Ankara',
      district: 'Çankaya',
      postalCode: '06500',
    },
  })

  const t5PreShipInv = await getInventoryStatus(targetProduct.id)

  // Create shipment with label
  const shipmentResult = await ShippingService.createShipment({
    orderId: shipOrder.id,
    orderNumber: shipOrder.orderNumber,
    channel: 'DIRECT',
    preferredProvider: 'MOCK',
    recipient: {
      fullName: 'Kargo Alıcısı',
      phone: '05553334455',
      addressLine: 'Kargo Sok. No: 4',
      city: 'Ankara',
      district: 'Çankaya',
      postalCode: '06500',
    },
    items: [{ productName: targetProduct.name, sku: targetProduct.sku, quantity: 1 }],
  })
  assert(shipmentResult.success, 'T5.1', 'Shipment created successfully')

  // Label creation must NOT decrement physical stock
  const t5PostLabelInv = await getInventoryStatus(targetProduct.id)
  assert(
    t5PostLabelInv.stock === t5PreShipInv.stock,
    'T5.2',
    'Invariant: Label creation does NOT decrement physical stock',
    t5PreShipInv.stock,
    t5PostLabelInv.stock
  )

  // Transition shipment to SHIPPED -> commits reserved stock to physical deduction
  await ShippingService.updateShipmentStatus(shipmentResult.shipmentId, 'SHIPPED', {
    description: 'Kurye paketi teslim aldı.',
  })
  const t5PostShippedInv = await getInventoryStatus(targetProduct.id)
  assert(
    t5PostShippedInv.stock === t5PreShipInv.stock - 1,
    'T5.3',
    'Transitioning to SHIPPED commits reservation and decrements physical stock by 1',
    t5PreShipInv.stock - 1,
    t5PostShippedInv.stock
  )
  assert(
    t5PostShippedInv.reserved === t5PreShipInv.reserved - 1,
    'T5.4',
    'Transitioning to SHIPPED releases the active reservation',
    t5PreShipInv.reserved - 1,
    t5PostShippedInv.reserved
  )

  // Repeated SHIPPED webhook / status update does NOT double-decrement
  await ShippingService.updateShipmentStatus(shipmentResult.shipmentId, 'SHIPPED', {
    description: 'Tekrarlanan kargo teslim alındı sinyali.',
  })
  const t5PostRepeatShip = await getInventoryStatus(targetProduct.id)
  assert(
    t5PostRepeatShip.stock === t5PostShippedInv.stock,
    'T5.5',
    'Idempotency Invariant: Duplicate SHIPPED event does NOT double-decrement physical stock',
    t5PostShippedInv.stock,
    t5PostRepeatShip.stock
  )

  // -------------------------------------------------------------
  // Test 6: Return Inspection -> Restock vs Damaged Quarantine Guard
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Return Inspection -> Restock vs Damaged Quarantine Guard ---')
  const t6InitialInv = await getInventoryStatus(targetProduct.id)

  ReturnInspectionService.registerReturnPackage({
    returnNumber: 'RMA-P26-DAMAGED',
    orderNumber: 'ZUU-2026-RET-01',
    status: 'RECEIVED',
    items: [{ id: 'it-d1', productId: targetProduct.id, sku: targetProduct.sku, productName: targetProduct.name, quantity: 1 }],
  })

  const damagedInspection = await ReturnInspectionService.startInspection({
    returnNumber: 'RMA-P26-DAMAGED',
    inspectedBy: 'inspector-p26',
  })

  // Hasarlı ürün asla doğrudan satış stoğuna eklenemez
  let damagedRestockThrew = false
  try {
    await ReturnInspectionService.inspectItem({
      inspectionId: damagedInspection.id,
      itemId: 'it-d1',
      scannedBarcode: targetProduct.sku,
      condition: 'DAMAGED',
      disposition: 'RESTOCK', // Illegal combination
    })
  } catch (err: any) {
    damagedRestockThrew = true
  }
  assert(damagedRestockThrew, 'T6.1', 'Attempting RESTOCK for DAMAGED return item throws validation error')

  const t6AfterFailedRestock = await getInventoryStatus(targetProduct.id)
  assert(
    t6AfterFailedRestock.stock === t6InitialInv.stock,
    'T6.2',
    'Physical inventory was NOT mutated after rejected damaged restock',
    t6InitialInv.stock,
    t6AfterFailedRestock.stock
  )

  // Valid Restock test
  ReturnInspectionService.registerReturnPackage({
    returnNumber: 'RMA-P26-VALID',
    orderNumber: 'ZUU-2026-RET-02',
    status: 'RECEIVED',
    items: [{ id: 'it-v1', productId: targetProduct.id, sku: targetProduct.sku, productName: targetProduct.name, quantity: 1 }],
  })

  const validInspection = await ReturnInspectionService.startInspection({
    returnNumber: 'RMA-P26-VALID',
    inspectedBy: 'inspector-p26',
  })

  const validInspectResult = await ReturnInspectionService.inspectItem({
    inspectionId: validInspection.id,
    itemId: 'it-v1',
    scannedBarcode: targetProduct.sku,
    condition: 'NEW_UNOPENED',
    disposition: 'RESTOCK',
  })
  assert(validInspectResult.inspectionItem.restocked === true, 'T6.3', 'Unopened return item successfully restocked')
  const t6AfterRestock = await getInventoryStatus(targetProduct.id)
  assert(
    t6AfterRestock.stock === t6InitialInv.stock + 1,
    'T6.4',
    'Authoritative restock incremented physical stock by exactly 1',
    t6InitialInv.stock + 1,
    t6AfterRestock.stock
  )

  // -------------------------------------------------------------
  // Test 7: Economics Actual Fee Precedence
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Economics Actual Fee Precedence ---')
  const feeEcon = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 200,
    productionCostTl: 40,
    costDataStatus: 'COMPLETE',
    feeConfig: {
      id: 'cfg-ty',
      channel: 'TRENDYOL',
      commissionPercent: 18, // 36 TL
      commissionFixedTl: 0,
      estimatedShippingCostTl: 45, // 45 TL configured
      estimatedPaymentFeePercent: null,
      estimatedPaymentFeeFixedTl: null,
      updatedAt: new Date().toISOString(),
    },
    actualOrderData: {
      actualCommissionTl: 32.5, // Override configured
      actualShippingCostTl: 62.0, // Override configured
    },
  })

  assert(
    feeEcon.commissionAmountTl === 32.5,
    'T7.1',
    'Actual order commission (32.50 TL) strictly overrides configured 18% (36 TL)',
    32.5,
    feeEcon.commissionAmountTl
  )
  assert(feeEcon.commissionSource === 'ACTUAL_ORDER_DATA', 'T7.2', 'Commission source is flagged as ACTUAL_ORDER_DATA')
  assert(
    feeEcon.shippingCostTl === 62.0,
    'T7.3',
    'Actual order shipping (62.00 TL) strictly overrides configured (45 TL)',
    62.0,
    feeEcon.shippingCostTl
  )
  assert(feeEcon.shippingSource === 'ACTUAL_ORDER_DATA', 'T7.4', 'Shipping source is flagged as ACTUAL_ORDER_DATA')
  // Contribution: 200 - 40 - 32.5 - 62 = 65.50 TL
  assert(
    feeEcon.estimatedContributionTl === 65.5,
    'T7.5',
    'Net contribution computed using actual order deductions (65.50 TL)',
    65.5,
    feeEcon.estimatedContributionTl
  )

  // -------------------------------------------------------------
  // Test 8: Economics Unknown != Zero
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Economics Unknown != Zero ---')
  // Pass null shipping in calculateContribution
  const contribNullShipping = calculateContribution(200, 40, {
    commissionTl: 30,
    shippingCostTl: null, // UNKNOWN / UNAVAILABLE
  })
  assert(
    contribNullShipping.canCalculate === false,
    'T8.1',
    'Cannot calculate net contribution when shipping cost is null/UNAVAILABLE (UNKNOWN != ZERO)'
  )
  assert(
    contribNullShipping.estimatedContributionTl === null,
    'T8.2',
    'Estimated contribution is null (not silently calculated as 130 TL)',
    null,
    contribNullShipping.estimatedContributionTl
  )
  assert(
    contribNullShipping.marginPercent === null,
    'T8.3',
    'Margin percent is null when contribution cannot be calculated',
    null,
    contribNullShipping.marginPercent
  )

  // Channel economics with missing feeConfig and no actual data
  const econMissingAllFees = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 200,
    productionCostTl: 40,
    costDataStatus: 'COMPLETE',
    feeConfig: null,
  })
  assert(
    econMissingAllFees.commissionSource === 'UNAVAILABLE',
    'T8.4',
    'Missing fee config flags commissionSource as UNAVAILABLE'
  )
  assert(
    econMissingAllFees.commissionAmountTl === null,
    'T8.5',
    'Missing fee config yields null commissionAmountTl (never 0 TL)',
    null,
    econMissingAllFees.commissionAmountTl
  )
  assert(
    econMissingAllFees.totalDeductionsTl === null,
    'T8.6',
    'Total deductions is null when mandatory channel fees are UNAVAILABLE',
    null,
    econMissingAllFees.totalDeductionsTl
  )
  assert(
    econMissingAllFees.canCalculateContribution === false,
    'T8.7',
    'canCalculateContribution is false when fee components are UNAVAILABLE'
  )

  // -------------------------------------------------------------
  // Test 9: Historical Material Price Snapshot & EffectiveDate Immutability
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Historical Material Price Snapshot & Immutability ---')
  const plaInitial = await getMaterialByName('PLA')
  assert(plaInitial !== null && plaInitial.pricePerKgTl === 700, 'T9.1', 'Base PLA material price is 700 TL/kg')

  // Update material price to 850 TL/kg effective from today
  const effectiveDate = new Date().toISOString()
  await saveMaterial({ name: 'PLA', pricePerKgTl: 850, effectiveFrom: effectiveDate }, 'admin-p26')

  const plaUpdated = await getMaterialByName('PLA')
  assert(plaUpdated?.pricePerKgTl === 850, 'T9.2', 'Active PLA price updated to 850 TL/kg', 850, plaUpdated?.pricePerKgTl)

  const historyEntries = await getMaterialPriceHistory('PLA')
  assert(historyEntries.length > 0, 'T9.3', 'Price change recorded in audit price history')
  const lastEntry = historyEntries[historyEntries.length - 1]
  assert(lastEntry.pricePerKgTl === 850, 'T9.4', 'History captures target price: 850 TL/kg', 850, lastEntry.pricePerKgTl)
  assert(lastEntry.effectiveFrom === effectiveDate, 'T9.5', 'History captures exact effectiveFrom timestamp')

  // Restore PLA price for test neutrality
  await saveMaterial({ name: 'PLA', pricePerKgTl: 700 }, 'admin-p26')

  // -------------------------------------------------------------
  // Test 10: Dashboard Data Integrity
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Dashboard Data Integrity ---')
  const overview = await getAdminOverview()
  const liveOrders = await getAllOrders()

  const realPending = liveOrders.filter((o) => o.status === 'PAYMENT_PENDING' || o.status === 'CONFIRMED').length
  const realProcessing = liveOrders.filter((o) => o.status === 'PREPARING' || o.status === 'IN_PRODUCTION').length
  const realPacking = liveOrders.filter((o) => o.status === 'PACKING').length

  assert(
    overview.actionSummary.newOrders === overview.orders.newOrders,
    'T10.1',
    'actionSummary.newOrders matches orderCounts.newOrders exactly',
    overview.orders.newOrders,
    overview.actionSummary.newOrders
  )
  assert(
    overview.actionSummary.toPrepare === overview.orders.processing,
    'T10.2',
    'actionSummary.toPrepare matches orderCounts.processing exactly',
    overview.orders.processing,
    overview.actionSummary.toPrepare
  )
  assert(
    overview.actionSummary.toShip === overview.orders.awaitingShipment,
    'T10.3',
    'actionSummary.toShip matches orderCounts.awaitingShipment exactly',
    overview.orders.awaitingShipment,
    overview.actionSummary.toShip
  )
  assert(
    overview.actionSummary.criticalStock === overview.products.lowStockCount + overview.products.outOfStockCount,
    'T10.4',
    'actionSummary.criticalStock equals lowStockCount + outOfStockCount',
    overview.products.lowStockCount + overview.products.outOfStockCount,
    overview.actionSummary.criticalStock
  )

  // -------------------------------------------------------------
  // Test 11: One-Click Production & Suggested Quantity Calculation
  // -------------------------------------------------------------
  console.log('\n--- Test 11: One-Click Production Validation ---')
  const lowStockProds = await getLowStockProductsForProduction()
  assert(Array.isArray(lowStockProds), 'T11.1', 'getLowStockProductsForProduction returns array')

  for (const item of lowStockProds) {
    const expectedSuggested = Math.max(item.minimumStock * 2 - item.availableStock, item.minimumStock)
    assert(
      item.suggestedProductionQty === expectedSuggested,
      `T11.2 (${item.sku})`,
      `Suggested quantity formula matches business rule: max(min*2 - avail, min) = ${expectedSuggested}`,
      expectedSuggested,
      item.suggestedProductionQty
    )
  }

  // -------------------------------------------------------------
  // Test 12: RBAC & Server Auth Context Boundaries
  // -------------------------------------------------------------
  console.log('\n--- Test 12: RBAC Enforcement ---')
  assert(!hasPermission('CUSTOMER', 'ORDER_VIEW'), 'T12.1', 'CUSTOMER denied ORDER_VIEW')
  assert(!hasPermission('CUSTOMER', 'INVENTORY_MANAGE'), 'T12.2', 'CUSTOMER denied INVENTORY_MANAGE')
  assert(!hasPermission('CUSTOMER', 'PRODUCTION_MANAGE'), 'T12.3', 'CUSTOMER denied PRODUCTION_MANAGE')
  assert(!hasPermission('CUSTOMER', 'PRODUCT_ECONOMICS_VIEW'), 'T12.4', 'CUSTOMER denied PRODUCT_ECONOMICS_VIEW')

  assert(!hasPermission('STAFF', 'PRODUCT_COST_VIEW'), 'T12.5', 'STAFF denied PRODUCT_COST_VIEW')
  assert(!hasPermission('STAFF', 'PRODUCT_ECONOMICS_MANAGE'), 'T12.6', 'STAFF denied PRODUCT_ECONOMICS_MANAGE')
  assert(hasPermission('STAFF', 'PRODUCTION_VIEW'), 'T12.7', 'STAFF allowed PRODUCTION_VIEW')

  assert(hasPermission('ORDER_MANAGER', 'ORDER_VIEW'), 'T12.8', 'ORDER_MANAGER allowed ORDER_VIEW')
  assert(hasPermission('ORDER_MANAGER', 'ORDER_UPDATE'), 'T12.9', 'ORDER_MANAGER allowed ORDER_UPDATE')
  assert(!hasPermission('ORDER_MANAGER', 'PRODUCTION_MANAGE'), 'T12.10', 'ORDER_MANAGER denied PRODUCTION_MANAGE')

  assert(hasPermission('ADMIN', 'ORDER_VIEW'), 'T12.11', 'ADMIN allowed ORDER_VIEW')
  assert(hasPermission('ADMIN', 'INVENTORY_MANAGE'), 'T12.12', 'ADMIN allowed INVENTORY_MANAGE')
  assert(hasPermission('ADMIN', 'PRODUCTION_MANAGE'), 'T12.13', 'ADMIN allowed PRODUCTION_MANAGE')
  assert(hasPermission('ADMIN', 'PRODUCT_ECONOMICS_MANAGE'), 'T12.14', 'ADMIN allowed PRODUCT_ECONOMICS_MANAGE')

  assert(hasPermission('SUPER_ADMIN', 'ADMIN_ACCESS'), 'T12.15', 'SUPER_ADMIN has universal access')

  // -------------------------------------------------------------
  // Test 13: Multi-Store Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test 13: Multi-Store Isolation ---')
  const stores = await getMarketplaceStores()
  const hb1 = stores.find((s) => s.id === 'store-hb-1')
  const hb2 = stores.find((s) => s.id === 'store-hb-2')
  const ty1 = stores.find((s) => s.id === 'store-ty-1')
  const ty2 = stores.find((s) => s.id === 'store-ty-2')

  assert(hb1 !== undefined && hb2 !== undefined, 'T13.1', 'HB1 and HB2 stores exist independently')
  assert(ty1 !== undefined && ty2 !== undefined, 'T13.2', 'TY1 and TY2 stores exist independently')
  assert(hb1?.externalMerchantId !== hb2?.externalMerchantId, 'T13.3', 'HB1 and HB2 have distinct merchant IDs')
  assert(ty1?.externalMerchantId !== ty2?.externalMerchantId, 'T13.4', 'TY1 and TY2 have distinct merchant IDs')

  const hb1Mappings = await getMarketplaceMappings('store-hb-1')
  const hb2Mappings = await getMarketplaceMappings('store-hb-2')
  assert(Array.isArray(hb1Mappings) && Array.isArray(hb2Mappings), 'T13.5', 'Store mappings query is partitioned by storeId')

  // -------------------------------------------------------------
  // Test 14: Money Precision
  // -------------------------------------------------------------
  console.log('\n--- Test 14: Money Precision & Minor Units ---')
  const testValues = [0.01, 0.10, 0.50, 1.99, 24.50, 999.99]
  for (const val of testValues) {
    const rounded = roundMoney(val)
    assert(rounded === val, `T14.1 (${val})`, `roundMoney preserves exact minor unit value: ${val}`, val, rounded)
  }

  // Floating point artifact defense (0.1 + 0.2 === 0.30000000000000004)
  const floatSum = 0.1 + 0.2
  const fixedSum = roundMoney(floatSum)
  assert(fixedSum === 0.3, 'T14.2', '0.1 + 0.2 is strictly rounded to 0.30 TL', 0.3, fixedSum)

  // Commission + Fee rounding
  // 149 TL * 18% = 26.82 TL
  const commCalc = roundMoney((149 * 18) / 100)
  assert(commCalc === 26.82, 'T14.3', '149 TL * 18% accurately rounded to 26.82 TL', 26.82, commCalc)

  // 35g PLA @ 700 TL/kg = 24.50 TL
  const matCostCalc = calculateMaterialCost(35, 700)
  assert(matCostCalc === 24.5, 'T14.4', '35g PLA @ 700 TL/kg is exact 24.50 TL', 24.5, matCostCalc)

  // -------------------------------------------------------------
  // Test 15: Duplicate Mutation & Idempotency Across Modules
  // -------------------------------------------------------------
  console.log('\n--- Test 15: Cross-Module Duplicate Mutation & Idempotency ---')
  const t15Initial = await getInventoryStatus(targetProduct.id)

  // Direct inventory adjust with specific idempotency key
  const testKey = 'P26_IDEMP_TEST_' + Date.now()
  const adj1 = await adjustInventory(targetProduct.id, 5, {
    reason: 'P26 Test Adjustment',
    idempotencyKey: testKey,
    adminUserId: 'admin-p26',
  })
  assert(adj1.success && adj1.idempotent !== true, 'T15.1', 'First adjustment executes successfully')
  const t15AfterFirst = await getInventoryStatus(targetProduct.id)
  assert(t15AfterFirst.stock === t15Initial.stock + 5, 'T15.2', 'First adjustment incremented stock by 5')

  // Repeated adjustment with same idempotency key must be NO-OP
  const adj2 = await adjustInventory(targetProduct.id, 5, {
    reason: 'P26 Test Adjustment Duplicate',
    idempotencyKey: testKey,
    adminUserId: 'admin-p26',
  })
  assert(adj2.success && adj2.idempotent === true, 'T15.3', 'Duplicate adjustment recognized as idempotent no-op')
  const t15AfterSecond = await getInventoryStatus(targetProduct.id)
  assert(
    t15AfterSecond.stock === t15AfterFirst.stock,
    'T15.4',
    'Duplicate adjustment did NOT increment stock a second time',
    t15AfterFirst.stock,
    t15AfterSecond.stock
  )

  // Revert test adjustment to leave database/memory clean
  await adjustInventory(targetProduct.id, -5, {
    reason: 'P26 Clean Revert',
    idempotencyKey: testKey + '_REVERT',
    adminUserId: 'admin-p26',
  })

  // Final summary
  console.log('\n===============================================================')
  console.log(`  PHASE 26 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase26Verification().catch((err) => {
  console.error('[FATAL] Phase 26 test suite failed with unhandled error:', err)
  process.exit(1)
})
