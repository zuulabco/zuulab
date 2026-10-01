import {
  canTransition,
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
  stockProductionOrder,
  failProductionOrder,
  cancelProductionOrder,
  getProductionOrders,
  getProductionOrderById,
  getProductionSummary,
  calculateProductCost,
  getLowStockProductsForProduction,
  ProductionStatus,
} from '../lib/services/production.service'
import {
  hasPermission,
  requirePermission,
} from '../lib/services/permissions.service'
import {
  getInventoryStatus,
  getInventoryTransactions,
  adjustInventory,
} from '../lib/services/inventory.service'
import { getAdminOverview } from '../lib/services/admin.service'
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

async function runTests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 23 — BUSINESS FIT & PRODUCTION SIMPLIFICATION')
  console.log('===============================================================\n')

  // ─────────────────────────────────────────────────────────────
  // A. Architecture & Core Exports
  // ─────────────────────────────────────────────────────────────
  console.log('--- A. Architecture & Core Wiring ---')

  assert(typeof canTransition === 'function', 'A.1', 'canTransition function exported')
  assert(typeof createProductionOrder === 'function', 'A.2', 'createProductionOrder function exported')
  assert(typeof startProductionOrder === 'function', 'A.3', 'startProductionOrder function exported')
  assert(typeof completeProductionOrder === 'function', 'A.4', 'completeProductionOrder function exported')
  assert(typeof stockProductionOrder === 'function', 'A.5', 'stockProductionOrder function exported')
  assert(typeof failProductionOrder === 'function', 'A.6', 'failProductionOrder function exported')
  assert(typeof cancelProductionOrder === 'function', 'A.7', 'cancelProductionOrder function exported')
  assert(typeof getProductionOrders === 'function', 'A.8', 'getProductionOrders function exported')
  assert(typeof getProductionOrderById === 'function', 'A.9', 'getProductionOrderById function exported')
  assert(typeof getProductionSummary === 'function', 'A.10', 'getProductionSummary function exported')
  assert(typeof calculateProductCost === 'function', 'A.11', 'calculateProductCost function exported')
  assert(typeof getLowStockProductsForProduction === 'function', 'A.12', 'getLowStockProductsForProduction exported')

  // ─────────────────────────────────────────────────────────────
  // B. State Machine Invariants
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- B. State Machine Invariants ---')

  assert(canTransition('PLANNED', 'QUEUED') === true, 'B.1', 'PLANNED -> QUEUED is valid')
  assert(canTransition('PLANNED', 'IN_PROGRESS') === true, 'B.2', 'PLANNED -> IN_PROGRESS is valid')
  assert(canTransition('PLANNED', 'CANCELLED') === true, 'B.3', 'PLANNED -> CANCELLED is valid')
  assert(canTransition('QUEUED', 'IN_PROGRESS') === true, 'B.4', 'QUEUED -> IN_PROGRESS is valid')
  assert(canTransition('QUEUED', 'CANCELLED') === true, 'B.5', 'QUEUED -> CANCELLED is valid')
  assert(canTransition('IN_PROGRESS', 'COMPLETED') === true, 'B.6', 'IN_PROGRESS -> COMPLETED is valid')
  assert(canTransition('IN_PROGRESS', 'FAILED') === true, 'B.7', 'IN_PROGRESS -> FAILED is valid')
  assert(canTransition('IN_PROGRESS', 'CANCELLED') === true, 'B.8', 'IN_PROGRESS -> CANCELLED is valid')
  assert(canTransition('COMPLETED', 'STOCKED') === true, 'B.9', 'COMPLETED -> STOCKED is valid')

  // Prohibited transitions
  assert(canTransition('PLANNED', 'COMPLETED') === false, 'B.10', 'PLANNED -> COMPLETED is strictly prohibited')
  assert(canTransition('PLANNED', 'STOCKED') === false, 'B.11', 'PLANNED -> STOCKED is strictly prohibited')
  assert(canTransition('COMPLETED', 'IN_PROGRESS') === false, 'B.12', 'COMPLETED -> IN_PROGRESS backward transition prohibited')
  assert(canTransition('STOCKED', 'IN_PROGRESS') === false, 'B.13', 'STOCKED -> IN_PROGRESS terminal state cannot transition')
  assert(canTransition('FAILED', 'COMPLETED') === false, 'B.14', 'FAILED -> COMPLETED terminal state cannot transition')
  assert(canTransition('CANCELLED', 'IN_PROGRESS') === false, 'B.15', 'CANCELLED -> IN_PROGRESS terminal state cannot transition')

  // ─────────────────────────────────────────────────────────────
  // C. Order Creation & Validation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- C. Production Order Creation ---')

  const targetProduct = MOCK_PRODUCTS[0]

  const invalidNoProduct = await createProductionOrder({
    productId: '',
    quantity: 10,
    createdBy: 'test-admin',
  })
  assert(invalidNoProduct.success === false, 'C.1', 'Creation without productId rejected')

  const invalidZeroQty = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 0,
    createdBy: 'test-admin',
  })
  assert(invalidZeroQty.success === false, 'C.2', 'Creation with 0 quantity rejected')

  const invalidNegativeQty = await createProductionOrder({
    productId: targetProduct.id,
    quantity: -5,
    createdBy: 'test-admin',
  })
  assert(invalidNegativeQty.success === false, 'C.3', 'Creation with negative quantity rejected')

  const createdRes = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 15,
    priority: 'HIGH',
    printerReference: 'Bambu Lab X1-Carbon',
    notes: 'Mat siyah filament ile üretilecek',
    createdBy: 'test-admin',
  })
  assert(createdRes.success === true, 'C.4', 'Valid production order created successfully')
  assert(createdRes.order?.status === 'PLANNED', 'C.5', 'Initial order status is PLANNED')
  assert(createdRes.order?.productNameSnapshot === targetProduct.name, 'C.6', 'Product name snapshot preserved')
  assert(createdRes.order?.skuSnapshot === targetProduct.sku, 'C.7', 'SKU snapshot preserved')
  assert(createdRes.order?.quantity === 15, 'C.8', 'Planned quantity is 15')
  assert(createdRes.order?.priority === 'HIGH', 'C.9', 'Priority set to HIGH')
  assert(createdRes.order?.printerReference === 'Bambu Lab X1-Carbon', 'C.10', 'Printer reference recorded')

  const orderId = createdRes.order!.id

  // ─────────────────────────────────────────────────────────────
  // D. Full Production Lifecycle: Start -> Complete -> Stock
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- D. Full Production Lifecycle ---')

  // 1. Start production
  const startRes = await startProductionOrder(orderId, 'operator-1')
  assert(startRes.success === true, 'D.1', 'Order transitioned to IN_PROGRESS')
  assert(startRes.order?.status === 'IN_PROGRESS', 'D.2', 'Order status verified as IN_PROGRESS')
  assert(startRes.order?.startedAt !== null, 'D.3', 'StartedAt timestamp recorded')

  // Cannot restart already started
  const restartRes = await startProductionOrder(orderId, 'operator-1')
  assert(restartRes.success === false, 'D.4', 'Cannot restart already in-progress order')

  // Cannot stock an in-progress order
  const earlyStockRes = await stockProductionOrder(orderId, 'operator-1')
  assert(earlyStockRes.success === false, 'D.5', 'Cannot stock an order directly from IN_PROGRESS')

  // 2. Complete production (15 planned, 14 successful, 1 failed)
  const completeRes = await completeProductionOrder(
    orderId,
    { completedQuantity: 15, failedQuantity: 1, notes: '1 adet baskı sırasında katman kayması yaşandı' },
    'operator-1'
  )
  assert(completeRes.success === true, 'D.6', 'Order completed successfully')
  assert(completeRes.order?.status === 'COMPLETED', 'D.7', 'Order status is COMPLETED')
  assert(completeRes.order?.completedQuantity === 15, 'D.8', 'Completed quantity is 15')
  assert(completeRes.order?.failedQuantity === 1, 'D.9', 'Failed quantity is 1')
  assert(completeRes.order?.acceptedQuantity === 14, 'D.10', 'Accepted quantity is 14 (15 - 1)')
  assert(completeRes.order?.completedAt !== null, 'D.11', 'CompletedAt timestamp recorded')

  // 3. Stock into central inventory
  const initialStock = (await getInventoryStatus(targetProduct.id)).stock
  const stockRes = await stockProductionOrder(orderId, 'admin-user')

  assert(stockRes.success === true, 'D.12', 'Stocking completed successfully')
  assert(stockRes.order?.status === 'STOCKED', 'D.13', 'Order status is STOCKED')
  assert(stockRes.order?.stockedAt !== null, 'D.14', 'StockedAt timestamp recorded')
  assert(stockRes.order?.stockedIdempotencyKey === 'PRODUCTION_STOCK:' + orderId, 'D.15', 'Stock idempotency key recorded')

  // Verify central inventory mutation
  const updatedStock = (await getInventoryStatus(targetProduct.id)).stock
  assert(updatedStock === initialStock + 14, 'D.16', `Central inventory incremented exactly by accepted quantity (+14): was ${initialStock}, now ${updatedStock}`)

  // Verify inventory transaction ledger entry
  const transactions = await getInventoryTransactions({ productId: targetProduct.id, type: 'PRODUCTION_STOCK' })
  const matchingTx = transactions.find((t) => t.idempotencyKey === 'PRODUCTION_STOCK:' + orderId)
  assert(matchingTx !== undefined, 'D.17', 'Central InventoryTransaction recorded with type PRODUCTION_STOCK')
  assert(matchingTx?.changeQuantity === 14, 'D.18', 'Transaction changeQuantity matches acceptedQuantity (14)')

  // ─────────────────────────────────────────────────────────────
  // E. Idempotency & Concurrency Safety
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- E. Idempotency & Safety ---')

  const repeatStockRes = await stockProductionOrder(orderId, 'admin-user')
  assert(repeatStockRes.success === true, 'E.1', 'Repeated stock call succeeds gracefully')
  assert(repeatStockRes.idempotent === true, 'E.2', 'Repeated stock call flagged as idempotent: true')

  const stockAfterRepeat = (await getInventoryStatus(targetProduct.id)).stock
  assert(stockAfterRepeat === updatedStock, 'E.3', 'Central stock was NOT duplicated on repeat stock call')

  // ─────────────────────────────────────────────────────────────
  // F. Failure & Cancellation Workflows
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- F. Failure & Cancellation Workflows ---')

  // F.1 Total failure batch
  const failOrderRes = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 5,
    createdBy: 'test-admin',
  })
  const failOrderId = failOrderRes.order!.id
  await startProductionOrder(failOrderId)
  const totalFailRes = await completeProductionOrder(
    failOrderId,
    { completedQuantity: 5, failedQuantity: 5, notes: 'Elektrik kesintisi nedeniyle tüm tabla yandı' }
  )
  assert(totalFailRes.success === true, 'F.1', 'Total failure completed')
  assert(totalFailRes.order?.status === 'FAILED', 'F.2', 'Batch automatically transitioned to FAILED when accepted is 0')
  assert(totalFailRes.order?.acceptedQuantity === 0, 'F.3', 'Accepted quantity is 0')

  // Attempting to stock a failed batch should be prohibited
  const stockFailedRes = await stockProductionOrder(failOrderId)
  assert(stockFailedRes.success === false, 'F.4', 'Cannot stock a FAILED production batch')

  // F.2 Explicit fail
  const explicitFailOrder = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 3,
    createdBy: 'test-admin',
  })
  await startProductionOrder(explicitFailOrder.order!.id)
  const explicitFailRes = await failProductionOrder(explicitFailOrder.order!.id, 'Nozzle tıkandı')
  assert(explicitFailRes.success === true, 'F.5', 'Explicit fail order succeeded')
  assert(explicitFailRes.order?.status === 'FAILED', 'F.6', 'Order marked as FAILED')

  // F.3 Cancellation
  const cancelOrderRes = await createProductionOrder({
    productId: targetProduct.id,
    quantity: 8,
    createdBy: 'test-admin',
  })
  const cancelRes = await cancelProductionOrder(cancelOrderRes.order!.id, 'Müşteri siparişi iptal etti')
  assert(cancelRes.success === true, 'F.7', 'Order cancelled successfully')
  assert(cancelRes.order?.status === 'CANCELLED', 'F.8', 'Order marked as CANCELLED')

  // ─────────────────────────────────────────────────────────────
  // G. Cost & Margin Calculator
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- G. Cost & Margin Calculator ---')

  const testProductCostData = {
    id: 'prod-cost-test-1',
    name: '3D Baskılı Kulaklık Standı',
    sku: 'ZUULAB-STAND-01',
    price: 350, // Selling price: 350 TL
    estimatedMaterialWeightGrams: 150, // 150g filament
    materialCostPerKgTl: 600, // 600 TL/kg -> (150/1000) * 600 = 90 TL
    packagingCostTl: 25, // 25 TL kutu + koruma
    otherProductionCostTl: 15, // 15 TL elektrik/amortisman
  }

  const costBreakdown = await calculateProductCost(testProductCostData)
  assert(costBreakdown !== null, 'G.1', 'Cost breakdown calculated')
  assert(costBreakdown?.materialCostTl === 90, 'G.2', `Material cost is 90 TL (calculated: ${costBreakdown?.materialCostTl})`)
  assert(costBreakdown?.packagingCostTl === 25, 'G.3', 'Packaging cost is 25 TL')
  assert(costBreakdown?.otherProductionCostTl === 15, 'G.4', 'Other production cost is 15 TL')
  assert(costBreakdown?.totalProductionCostTl === 130, 'G.5', `Total cost is 130 TL (90+25+15) (calculated: ${costBreakdown?.totalProductionCostTl})`)
  assert(costBreakdown?.sellingPriceTl === 350, 'G.6', 'Selling price is 350 TL')
  assert(costBreakdown?.grossMarginTl === 220, 'G.7', `Gross margin is 220 TL (350 - 130) (calculated: ${costBreakdown?.grossMarginTl})`)
  assert(costBreakdown?.grossMarginPercent === 62.9, 'G.8', `Gross margin percent is 62.9% (calculated: ${costBreakdown?.grossMarginPercent})`)

  // Calculator handles product from ID or with default fallback
  const mockCost = await calculateProductCost(targetProduct.id)
  assert(mockCost !== null, 'G.9', 'Cost breakdown works with product ID lookup')
  assert(typeof mockCost?.totalProductionCostTl === 'number', 'G.10', 'Total production cost is a valid number')

  // ─────────────────────────────────────────────────────────────
  // H. Low Stock Detection & Operational Dashboard
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- H. Low Stock Detection ---')

  // Trigger a low stock condition for testing
  await adjustInventory(targetProduct.id, -60, { reason: 'Test low stock trigger' })
  const lowStockList = await getLowStockProductsForProduction()
  assert(Array.isArray(lowStockList), 'H.1', 'Low stock returns array')

  const detectedLowStock = lowStockList.find((i) => i.productId === targetProduct.id)
  assert(detectedLowStock !== undefined, 'H.2', `Low stock detected for ${targetProduct.sku} (available: ${detectedLowStock?.availableStock} < min: ${detectedLowStock?.minimumStock})`)
  assert((detectedLowStock?.suggestedProductionQty || 0) > 0, 'H.3', `Suggested production qty calculated: ${detectedLowStock?.suggestedProductionQty}`)

  // Restore inventory
  await adjustInventory(targetProduct.id, 60, { reason: 'Restore stock after test' })

  const summary = await getProductionSummary()
  assert(summary.totalOrders > 0, 'H.4', 'Production summary returns total orders count')
  assert(typeof summary.active === 'number', 'H.5', 'Summary active count is number')
  assert(typeof summary.completed === 'number', 'H.6', 'Summary completed count is number')
  assert(typeof summary.stocked === 'number', 'H.7', 'Summary stocked count is number')
  assert(summary.totalUnitsProduced >= 14, 'H.8', `Total units produced tracked: ${summary.totalUnitsProduced}`)

  // ─────────────────────────────────────────────────────────────
  // I. RBAC Permissions Enforcement
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- I. RBAC Permissions Enforcement ---')

  assert(hasPermission('CUSTOMER', 'PRODUCTION_VIEW') === false, 'I.1', 'CUSTOMER denied PRODUCTION_VIEW')
  assert(hasPermission('CUSTOMER', 'PRODUCTION_MANAGE') === false, 'I.2', 'CUSTOMER denied PRODUCTION_MANAGE')
  assert(hasPermission('CUSTOMER', 'PRODUCT_COST_VIEW') === false, 'I.3', 'CUSTOMER denied PRODUCT_COST_VIEW')
  assert(hasPermission('CUSTOMER', 'PRODUCT_COST_MANAGE') === false, 'I.4', 'CUSTOMER denied PRODUCT_COST_MANAGE')

  assert(hasPermission('STAFF', 'PRODUCTION_VIEW') === true, 'I.5', 'STAFF allowed PRODUCTION_VIEW (operator view)')
  assert(hasPermission('STAFF', 'PRODUCTION_MANAGE') === false, 'I.6', 'STAFF denied PRODUCTION_MANAGE')
  assert(hasPermission('STAFF', 'PRODUCT_COST_VIEW') === false, 'I.7', 'STAFF denied PRODUCT_COST_VIEW')

  assert(hasPermission('ADMIN', 'PRODUCTION_VIEW') === true, 'I.8', 'ADMIN allowed PRODUCTION_VIEW')
  assert(hasPermission('ADMIN', 'PRODUCTION_MANAGE') === true, 'I.9', 'ADMIN allowed PRODUCTION_MANAGE')
  assert(hasPermission('ADMIN', 'PRODUCT_COST_VIEW') === true, 'I.10', 'ADMIN allowed PRODUCT_COST_VIEW')
  assert(hasPermission('ADMIN', 'PRODUCT_COST_MANAGE') === true, 'I.11', 'ADMIN allowed PRODUCT_COST_MANAGE')

  assert(hasPermission('SUPER_ADMIN', 'PRODUCTION_MANAGE') === true, 'I.12', 'SUPER_ADMIN has PRODUCTION_MANAGE')

  // ─────────────────────────────────────────────────────────────
  // J. Admin Overview Service Integration
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- J. Admin Overview Integration ---')

  const overview = await getAdminOverview()
  assert(overview.production !== undefined, 'J.1', 'Admin overview includes production summary')
  assert(overview.production.totalOrders > 0, 'J.2', 'Admin overview reflects production orders')
  assert(overview.lowStock !== undefined, 'J.3', 'Admin overview includes lowStock list')
  assert(Array.isArray(overview.lowStock), 'J.4', 'Admin overview lowStock is an array')

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n===============================================================')
  console.log(`  PHASE 23 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Phase 23 verification failed with error:', err)
  process.exit(1)
})
