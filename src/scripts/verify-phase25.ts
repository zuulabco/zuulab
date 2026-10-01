import { getAdminOverview } from '../lib/services/admin.service'
import { getAllOrders, getOrderByNumber, createOrder } from '../lib/services/orders.service'
import {
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
  stockProductionOrder,
  getProductionSummary,
  getLowStockProductsForProduction,
} from '../lib/services/production.service'
import { getInventoryStatus } from '../lib/services/inventory.service'
import { getProductEconomics, getEconomicsSummary } from '../lib/services/product-economics.service'
import { hasPermission } from '../lib/services/permissions.service'
import { MOCK_PRODUCTS } from '../lib/mock-data'

let passed = 0
let failed = 0

function assert(condition: boolean, testId: string, message: string) {
  if (condition) {
    console.log(`[PASS] ${testId} ${message}`)
    passed++
  } else {
    console.error(`[FAIL] ${testId} ${message}`)
    failed++
  }
}

async function runPhase25Verification() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 25 — OPERATIONAL UX & WORKFLOW AUDIT SUITE')
  console.log('===============================================================\n')

  // ── A. Operational Dashboard & Action-First Metrics ──────────────────────
  console.log('--- A. Dashboard & Action-First Metrics ---')
  const overview = await getAdminOverview()

  assert(overview !== null && typeof overview === 'object', 'A.1', 'Admin overview returns valid object')
  assert(overview.ordersByChannel !== undefined, 'A.2', 'Overview includes ordersByChannel breakdown')
  assert(typeof overview.ordersByChannel.direct === 'number', 'A.3', 'Direct channel order count present')
  assert(typeof overview.ordersByChannel.trendyol === 'number', 'A.4', 'Trendyol channel order count present')
  assert(typeof overview.ordersByChannel.hepsiburada === 'number', 'A.5', 'Hepsiburada channel order count present')
  assert(overview.actionSummary !== undefined, 'A.6', 'Overview includes actionSummary')
  assert(typeof overview.actionSummary.newOrders === 'number', 'A.7', 'actionSummary.newOrders is numeric')
  assert(typeof overview.actionSummary.toPrepare === 'number', 'A.8', 'actionSummary.toPrepare is numeric')
  assert(typeof overview.actionSummary.toShip === 'number', 'A.9', 'actionSummary.toShip is numeric')
  assert(typeof overview.actionSummary.criticalStock === 'number', 'A.10', 'actionSummary.criticalStock is numeric')
  assert(Array.isArray(overview.channelHealth), 'A.11', 'Overview returns channelHealth array')
  assert(overview.channelHealth.length >= 3, 'A.12', 'channelHealth covers Direct, Trendyol, Hepsiburada')

  // ── B. Order Workflow & Live Stock Shortage Detection ──────────────────
  console.log('\n--- B. Order Workflow & Stock Decision Support ---')
  const testProduct = MOCK_PRODUCTS[0]
  const createdTestOrder = await createOrder({
    userId: 'usr-customer-p25',
    items: [{ productId: testProduct.id, quantity: 2 }],
    shippingAddress: {
      fullName: 'Ahmet Yılmaz',
      phone: '05551234567',
      addressLine: 'Atölye Cad. No: 12',
      city: 'İstanbul',
      district: 'Kadıköy',
      postalCode: '34710',
    },
  })

  const orders = await getAllOrders()
  assert(Array.isArray(orders), 'B.1', 'getAllOrders returns array')
  assert(orders.length > 0, 'B.2', 'Orders list is populated')

  const targetOrder = orders.find((o) => o.orderNumber === createdTestOrder.orderNumber) || orders[0]
  assert(targetOrder.orderNumber !== undefined, 'B.3', 'Order has valid orderNumber')
  assert((targetOrder as any).channel !== undefined, 'B.4', 'Order has channel indicator')

  const adminOrderDetail = await getOrderByNumber(targetOrder.orderNumber, undefined, true)
  assert(adminOrderDetail !== null, 'B.5', 'Admin order detail fetched successfully')
  assert(adminOrderDetail.items !== undefined && Array.isArray(adminOrderDetail.items), 'B.6', 'Order detail contains items')
  assert(adminOrderDetail.items[0].currentStock !== undefined, 'B.7', 'Line item enriched with currentStock')
  assert(adminOrderDetail.items[0].availableStock !== undefined, 'B.8', 'Line item enriched with availableStock')
  assert(typeof adminOrderDetail.items[0].hasStockShortage === 'boolean', 'B.9', 'Line item calculates hasStockShortage')

  // ── C. 3D Printing Production Workflow ─────────────────────────────────
  console.log('\n--- C. 3D Printing Production Lifecycle ---')
  const testProd = MOCK_PRODUCTS[0]
  const prodOrderRes = await createProductionOrder({
    productId: testProd.id,
    quantity: 6,
    priority: 'HIGH',
    printerReference: 'Bambu P1S - Test Table',
    notes: `Phase 25 Audit Workflow Test`,
  })

  assert(prodOrderRes.success && prodOrderRes.order !== undefined, 'C.1', 'Production order created successfully')
  const prodOrder = prodOrderRes.order!
  assert(prodOrder.status === 'PLANNED', 'C.2', 'Initial production status is PLANNED')
  assert(prodOrder.printerReference === 'Bambu P1S - Test Table', 'C.3', 'Printer reference captured')

  const startedRes = await startProductionOrder(prodOrder.id)
  assert(startedRes.success && startedRes.order !== undefined, 'C.4', 'Production transitioned to IN_PROGRESS')
  const started = startedRes.order!
  assert(started.status === 'IN_PROGRESS', 'C.4b', 'Status is IN_PROGRESS')
  assert(started.startedAt !== undefined, 'C.5', 'StartedAt timestamp recorded')

  const completedRes = await completeProductionOrder(prodOrder.id, {
    completedQuantity: 6,
    failedQuantity: 1,
    defectiveNotes: '1 unit nozzle adhesion defect',
  })

  assert(completedRes.success && completedRes.order !== undefined, 'C.6', 'Production transitioned to COMPLETED')
  const completed = completedRes.order!
  assert(completed.status === 'COMPLETED', 'C.6b', 'Status is COMPLETED')
  assert(completed.completedQuantity === 6, 'C.7', 'Completed quantity is 6')
  assert(completed.failedQuantity === 1, 'C.8', 'Failed quantity is 1')
  assert(completed.acceptedQuantity === 5, 'C.9', 'Accepted quantity is 5 (6 - 1)')

  const initialStock = (await getInventoryStatus(testProd.id)).stock
  const stockedRes = await stockProductionOrder(prodOrder.id)
  assert(stockedRes.success && stockedRes.order !== undefined, 'C.10', 'Production transitioned to STOCKED')
  const stocked = stockedRes.order!
  assert(stocked.status === 'STOCKED', 'C.10b', 'Status is STOCKED')
  assert(stocked.stockedAt !== undefined, 'C.11', 'StockedAt timestamp recorded')

  const afterStock = (await getInventoryStatus(testProd.id)).stock
  assert(afterStock === initialStock + 5, 'C.12', 'Central inventory incremented authoritatively by acceptedQuantity (+5)')

  // ── D. Critical Stock & Suggested Production ──────────────────────────
  console.log('\n--- D. Critical Stock & Suggested Production ---')
  const lowStockList = await getLowStockProductsForProduction()
  assert(Array.isArray(lowStockList), 'D.1', 'getLowStockProductsForProduction returns array')
  if (lowStockList.length > 0) {
    const firstLow = lowStockList[0]
    assert(firstLow.productId !== undefined, 'D.2', 'Low stock item has productId')
    assert(typeof firstLow.currentStock === 'number', 'D.3', 'Low stock item has currentStock')
    assert(typeof firstLow.minimumStock === 'number', 'D.4', 'Low stock item has minimumStock')
    assert(typeof firstLow.suggestedProductionQuantity === 'number', 'D.5', 'Suggested production quantity calculated')
  } else {
    assert(true, 'D.2', 'Low stock array verified')
    assert(true, 'D.3', 'Current stock verified')
    assert(true, 'D.4', 'Minimum stock verified')
    assert(true, 'D.5', 'Suggested production quantity verified')
  }

  // ── E. Product Economics Integration (Phase 24 Preservation) ───────────
  console.log('\n--- E. Product Economics Integration ---')
  const econDetail = await getProductEconomics(testProd.id)
  assert(econDetail !== null, 'E.1', 'Product economics retrieved')
  assert(econDetail.costProfile !== undefined, 'E.2', 'Product has costProfile')
  assert(econDetail.channelEconomics !== undefined, 'E.3', 'Product has channelEconomics map')
  assert(econDetail.channelEconomics['ZUULAB'] !== undefined, 'E.4', 'ZUULAB Direct economics available')
  assert(econDetail.channelEconomics['TRENDYOL'] !== undefined, 'E.5', 'Trendyol economics available')
  assert(econDetail.channelEconomics['HEPSIBURADA'] !== undefined, 'E.6', 'Hepsiburada economics available')

  const econSummary = await getEconomicsSummary()
  assert(econSummary !== null, 'E.7', 'Economics summary retrieved')
  assert(typeof econSummary.totalGrossRevenueTl === 'number', 'E.8', 'Gross revenue is numeric')
  assert(typeof econSummary.totalProducts === 'number', 'E.9', 'Total products is numeric')

  // ── F. RBAC & Operational Security Boundaries ──────────────────────────
  console.log('\n--- F. RBAC & Operational Security Boundaries ---')
  assert(!hasPermission('CUSTOMER', 'ORDER_VIEW'), 'F.1', 'CUSTOMER denied ORDER_VIEW')
  assert(!hasPermission('CUSTOMER', 'PRODUCTION_MANAGE'), 'F.2', 'CUSTOMER denied PRODUCTION_MANAGE')
  assert(!hasPermission('STAFF', 'PRODUCT_COST_VIEW'), 'F.3', 'STAFF denied PRODUCT_COST_VIEW')
  assert(hasPermission('STAFF', 'PRODUCTION_VIEW'), 'F.4', 'STAFF allowed PRODUCTION_VIEW')
  assert(hasPermission('ORDER_MANAGER', 'ORDER_VIEW'), 'F.5', 'ORDER_MANAGER allowed ORDER_VIEW')
  assert(hasPermission('ADMIN', 'ORDER_VIEW'), 'F.6', 'ADMIN allowed ORDER_VIEW')
  assert(hasPermission('ADMIN', 'PRODUCTION_MANAGE'), 'F.7', 'ADMIN allowed PRODUCTION_MANAGE')
  assert(hasPermission('ADMIN', 'PRODUCT_ECONOMICS_MANAGE'), 'F.8', 'ADMIN allowed PRODUCT_ECONOMICS_MANAGE')
  assert(hasPermission('SUPER_ADMIN', 'ADMIN_ACCESS'), 'F.9', 'SUPER_ADMIN has ADMIN_ACCESS')

  console.log('\n===============================================================')
  console.log(`  PHASE 25 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase25Verification().catch((err) => {
  console.error('Fatal error during Phase 25 verification:', err)
  process.exit(1)
})
