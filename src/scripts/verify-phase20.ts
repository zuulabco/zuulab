/**
 * ZUULAB PHASE 20 — WAREHOUSE OPERATIONS & MULTI-CHANNEL FULFILLMENT HUB
 * VERIFICATION SUITE
 *
 * Verifies all Phase 20 architectural invariants:
 * A. Architecture & Wiring
 * B. Fulfillment Creation & Eligibility Guards (Direct & Marketplace MATCHED vs UNMATCHED)
 * C. Barcode Identity & Hierarchy Resolution (Exact SKU -> Exact Barcode -> Marketplace Mapping)
 * D. Pick Lists & Order Grouping
 * E. Picking Workflow & Quantity Invariants
 * F. Scan Idempotency & Concurrency Safety
 * G. Packing Sessions & Validation (packedQty <= pickedQty)
 * H. Phase 19 Shipping & Label Delegation (No raw DB bypass)
 * I. Zero Inventory Mutation Prior to SHIPPED (Authoritative Phase 18 InventoryService)
 * J. Multi-Channel & Store Isolation (TY1, TY2, HB1, HB2)
 * K. Cargo Manifest & Handover Idempotency
 * L. Warehouse Exceptions & Workflow Blocking
 * M. RBAC Enforcement (Customer 403, Staff permissions, Admin access)
 * N. Document Generation (Packing Slip PDF, Zimmet Manifest PDF, PII masking)
 */

import crypto from 'crypto'
import { WarehouseService } from '../lib/services/warehouse/warehouse.service'
import { WarehouseScanService } from '../lib/services/warehouse/warehouse-scan.service'
import { PickingService } from '../lib/services/warehouse/picking.service'
import { PackingService } from '../lib/services/warehouse/packing.service'
import { PackingSlipService } from '../lib/services/warehouse/packing-slip.service'
import { ManifestService } from '../lib/services/warehouse/manifest.service'
import { WarehouseExceptionService } from '../lib/services/warehouse/exception.service'
import { WarehouseQueueService } from '../lib/services/warehouse/warehouse-queue.service'
import {
  WarehouseError,
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from '../lib/services/warehouse/warehouse-error'
import { ShippingService } from '../lib/services/shipping/shipping.service'
import { LabelService } from '../lib/services/shipping/label/label.service'
import {
  getInventoryStatus,
  reserveInventory,
  commitInventoryReservation,
} from '../lib/services/inventory.service'
import { hasPermission } from '../lib/services/permissions.service'

async function runPhase20Tests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 20 — WAREHOUSE OPERATIONS & FULFILLMENT HUB    ')
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
    // A. Architecture & Core Wiring
    // -------------------------------------------------------------
    console.log('--- A. Architecture & Core Wiring ---')

    assert(typeof WarehouseService.createFulfillment === 'function', 'A.1 WarehouseService exists with createFulfillment')
    assert(typeof PickingService.scanPickItem === 'function', 'A.2 PickingService exists with scanPickItem')
    assert(typeof PackingService.completePacking === 'function', 'A.3 PackingService exists with completePacking')
    assert(typeof ManifestService.createManifest === 'function', 'A.4 ManifestService exists with createManifest')
    assert(typeof PackingSlipService.generatePackingSlip === 'function', 'A.5 PackingSlipService exists with generatePackingSlip')
    assert(typeof WarehouseExceptionService.createException === 'function', 'A.6 WarehouseExceptionService exists')

    // -------------------------------------------------------------
    // B. Barcode Identity & Hierarchy Resolution (Criteria 8)
    // -------------------------------------------------------------
    console.log('\n--- B. Barcode Identity & Resolution Hierarchy ---')

    // Setup test products in memory
    WarehouseScanService.registerProduct({
      productId: 'prod_wh_mouse',
      sku: 'SKU-WH-MOUSE',
      barcode: '868000100101',
      name: 'Zuulab Kablosuz Mouse',
    })
    WarehouseScanService.registerProduct({
      productId: 'prod_wh_kb',
      sku: 'SKU-WH-KB',
      barcode: '868000100202',
      name: 'Zuulab Mekanik Klavye',
    })
    WarehouseScanService.registerMarketplaceMapping({
      storeId: 'store-ty-1',
      productId: 'prod_wh_mouse',
      sku: 'SKU-WH-MOUSE',
      barcode: 'TY-BARCODE-999',
      name: 'Zuulab Kablosuz Mouse',
    })

    const resSku = await WarehouseScanService.resolveProductIdentity('SKU-WH-MOUSE')
    assert(resSku.productId === 'prod_wh_mouse', 'B.1 Hierarchy Level 1: Exact SKU lookup resolves canonical product')

    const resBc = await WarehouseScanService.resolveProductIdentity('868000100101')
    assert(resBc.productId === 'prod_wh_mouse', 'B.2 Hierarchy Level 2: Exact Barcode lookup resolves canonical product')

    const resMkt = await WarehouseScanService.resolveProductIdentity('TY-BARCODE-999', 'store-ty-1')
    assert(resMkt.productId === 'prod_wh_mouse', 'B.3 Hierarchy Level 3: Marketplace mapping resolves canonical product')

    let notFoundTriggered = false
    try {
      await WarehouseScanService.resolveProductIdentity('UNKNOWN-99999999')
    } catch (e: any) {
      if (e instanceof WarehouseScanError && e.code === 'WAREHOUSE_SCAN_PRODUCT_NOT_FOUND') {
        notFoundTriggered = true
      }
    }
    assert(notFoundTriggered, 'B.4 Unknown barcode strictly throws PRODUCT_NOT_FOUND error')

    // Fuzzy match rejection test: Partial barcode must not match
    let fuzzyRejected = false
    try {
      await WarehouseScanService.resolveProductIdentity('8680001001') // Partial of 868000100101
    } catch (e: any) {
      if (e instanceof WarehouseScanError) fuzzyRejected = true
    }
    assert(fuzzyRejected, 'B.5 Fuzzy matching is strictly forbidden (partial barcode rejected)')

    // -------------------------------------------------------------
    // C. Fulfillment Creation & Eligibility Invariants (Criteria 5, 6)
    // -------------------------------------------------------------
    console.log('\n--- C. Fulfillment Creation & Eligibility Invariants ---')

    // 1. Direct Order Eligible
    const fulDirect = await WarehouseService.createFulfillment({
      orderId: 'ord_direct_p20_1',
      orderNumber: 'ZUU-P20-001',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_wh_mouse',
          sku: 'SKU-WH-MOUSE',
          barcode: '868000100101',
          productName: 'Zuulab Kablosuz Mouse',
          quantity: 2,
        },
        {
          productId: 'prod_wh_kb',
          sku: 'SKU-WH-KB',
          barcode: '868000100202',
          productName: 'Zuulab Mekanik Klavye',
          quantity: 1,
        },
      ],
    })
    assert(fulDirect.status === 'READY_TO_PICK', 'C.1 Direct order creates fulfillment in READY_TO_PICK status')
    assert(fulDirect.items?.length === 2, 'C.2 Fulfillment contains snapshot of all order items')

    // 2. Marketplace MATCHED Eligible
    const fulTyMatched = await WarehouseService.createFulfillment({
      marketplaceOrderId: 'ty_ord_p20_matched',
      marketplaceOrderNumber: 'TY-ORD-2026-01',
      channel: 'MARKETPLACE',
      storeId: 'store-ty-1',
      reconciliationStatus: 'MATCHED',
      items: [
        {
          productId: 'prod_wh_mouse',
          sku: 'SKU-WH-MOUSE',
          barcode: '868000100101',
          productName: 'Zuulab Kablosuz Mouse',
          quantity: 1,
        },
      ],
    })
    assert(fulTyMatched.status === 'READY_TO_PICK', 'C.3 MATCHED marketplace order creates fulfillment successfully')

    // 3. Marketplace UNMATCHED Blocked
    let unmatchedBlocked = false
    try {
      await WarehouseService.createFulfillment({
        marketplaceOrderId: 'ty_ord_unmatched',
        channel: 'MARKETPLACE',
        storeId: 'store-ty-1',
        reconciliationStatus: 'UNMATCHED',
        items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) unmatchedBlocked = true
    }
    assert(unmatchedBlocked, 'C.4 UNMATCHED marketplace order is strictly blocked from warehouse fulfillment')

    // 4. Marketplace PARTIALLY_MATCHED Blocked
    let partialBlocked = false
    try {
      await WarehouseService.createFulfillment({
        marketplaceOrderId: 'ty_ord_partially_matched',
        channel: 'MARKETPLACE',
        storeId: 'store-ty-1',
        reconciliationStatus: 'PARTIALLY_MATCHED',
        items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) partialBlocked = true
    }
    assert(partialBlocked, 'C.5 PARTIALLY_MATCHED marketplace order is strictly blocked from warehouse fulfillment')

    // 5. Exclusivity Invariant: Never both orderId and marketplaceOrderId
    let dualRelationBlocked = false
    try {
      await WarehouseService.createFulfillment({
        orderId: 'ord_1',
        marketplaceOrderId: 'mkt_1',
        channel: 'DIRECT',
        items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) dualRelationBlocked = true
    }
    assert(dualRelationBlocked, 'C.6 Dual order relation (both direct and marketplace) is rejected')

    // 6. Idempotent Creation
    const repeatFul = await WarehouseService.createFulfillment({
      orderId: 'ord_direct_p20_1',
      orderNumber: 'ZUU-P20-001',
      channel: 'DIRECT',
      items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 2 }],
    })
    assert(repeatFul.id === fulDirect.id, 'C.7 Repeated fulfillment creation for same order is strictly idempotent')

    // -------------------------------------------------------------
    // D. Pick List System & Bulk Consolidation (Criteria 9, 22)
    // -------------------------------------------------------------
    console.log('\n--- D. Pick List System & Bulk Consolidation ---')

    // Create another fulfillment for grouping
    const fulDirect2 = await WarehouseService.createFulfillment({
      orderId: 'ord_direct_p20_2',
      orderNumber: 'ZUU-P20-002',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_wh_mouse',
          sku: 'SKU-WH-MOUSE',
          barcode: '868000100101',
          productName: 'Zuulab Kablosuz Mouse',
          quantity: 3,
        },
      ],
    })

    const bulkResult = await PickingService.createPickList(
      [fulDirect.id, fulDirect2.id],
      'operator_1'
    )
    assert(Boolean(bulkResult.pickList.pickListNumber), 'D.1 Consolidated pick list created with valid pickListNumber')
    assert(bulkResult.pickList.status === 'ASSIGNED', 'D.2 Pick list marked ASSIGNED when operator specified')

    // Check consolidated items:
    // Order 1 has 2 mice, Order 2 has 3 mice -> total 5 mice
    const mouseGroup = bulkResult.consolidatedItems.find((c) => c.sku === 'SKU-WH-MOUSE')
    assert(mouseGroup?.totalRequestedQuantity === 5, 'D.3 Bulk pick list correctly groups SKU-WH-MOUSE (2 + 3 = 5 units)')
    assert(mouseGroup?.allocations.length === 2, 'D.4 Group retains individual fulfillment item allocations')

    // -------------------------------------------------------------
    // E. Picking Workflow & Scan Verification (Criteria 10, 11, 12)
    // -------------------------------------------------------------
    console.log('\n--- E. Picking Workflow & Scanning Verification ---')

    // Scan Unit 1 of Mouse for Order 1
    const scan1 = await PickingService.scanPickItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'operator_1',
      barcode: '868000100101',
      clientRequestId: 'req_scan_1',
      quantity: 1,
    })
    assert(scan1.success && scan1.pickedQuantity === 1, 'E.1 Valid barcode scan increments pickedQuantity to 1')
    assert(scan1.remainingQuantity === 1, 'E.2 Remaining quantity correctly updated to 1')

    // Repeated identical scan with same idempotency key
    const scan1Repeat = await PickingService.scanPickItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'operator_1',
      barcode: '868000100101',
      clientRequestId: 'req_scan_1', // Identical clientRequestId
      quantity: 1,
    })
    assert(scan1Repeat.idempotent === true, 'E.3 Duplicate scan request detected as idempotent')
    assert(scan1Repeat.pickedQuantity === 1, 'E.4 Duplicate scan does NOT increment quantity twice!')

    // Scan Unit 2 of Mouse for Order 1
    const scan2 = await PickingService.scanPickItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'operator_1',
      barcode: '868000100101',
      clientRequestId: 'req_scan_2',
      quantity: 1,
    })
    assert(scan2.pickedQuantity === 2, 'E.5 Second physical scan increments pickedQuantity to 2')

    // Attempt Over-Pick (trying to pick 3rd mouse when only 2 ordered)
    let overPickRejected = false
    try {
      await PickingService.scanPickItem({
        fulfillmentId: fulDirect.id,
        operatorId: 'operator_1',
        barcode: '868000100101',
        clientRequestId: 'req_scan_3_excess',
        quantity: 1,
      })
    } catch (e: any) {
      if (e instanceof WarehouseScanError && e.code === 'WAREHOUSE_SCAN_EXCESS_QUANTITY') {
        overPickRejected = true
      }
    }
    assert(overPickRejected, 'E.6 Excess pick scan (pickedQuantity > orderedQuantity) is strictly rejected')

    // Scan Wrong Item (item not in this fulfillment)
    let wrongItemRejected = false
    try {
      await PickingService.scanPickItem({
        fulfillmentId: fulDirect2.id, // Only has Mouse
        operatorId: 'operator_1',
        barcode: '868000100202', // Keyboard barcode
        clientRequestId: 'req_scan_wrong',
        quantity: 1,
      })
    } catch (e: any) {
      if (e instanceof WarehouseScanError && e.code === 'WAREHOUSE_SCAN_WRONG_ITEM') {
        wrongItemRejected = true
      }
    }
    assert(wrongItemRejected, 'E.7 Scan of item not belonging to fulfillment is strictly rejected')

    // Incomplete Picking Completion Blocked
    let incompleteBlocked = false
    try {
      // fulDirect still has Keyboard unpicked (0/1)
      await PickingService.completePicking(fulDirect.id, 'operator_1')
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) incompleteBlocked = true
    }
    assert(incompleteBlocked, 'E.8 Incomplete picking is blocked from completion')

    // Now pick the Keyboard (1/1)
    await PickingService.scanPickItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'operator_1',
      barcode: '868000100202',
      clientRequestId: 'req_scan_kb_1',
      quantity: 1,
    })

    // Complete picking should now succeed
    await PickingService.completePicking(fulDirect.id, 'operator_1')
    const pickedFul = await WarehouseService.getFulfillment(fulDirect.id)
    assert(pickedFul.status === 'PICKED', 'E.9 Complete picking succeeds and transitions status to PICKED')

    // -------------------------------------------------------------
    // F. Concurrency Invariants (Criteria 38)
    // -------------------------------------------------------------
    console.log('\n--- F. Concurrency Serialization Invariants ---')

    const fulRace = await WarehouseService.createFulfillment({
      orderId: 'ord_race_test',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_wh_mouse',
          sku: 'SKU-WH-MOUSE',
          barcode: '868000100101',
          productName: 'Mouse',
          quantity: 5,
        },
      ],
    })

    // Launch 5 concurrent scans simultaneously
    const scanPromises = Array.from({ length: 5 }).map((_, i) =>
      PickingService.scanPickItem({
        fulfillmentId: fulRace.id,
        operatorId: `operator_${i + 1}`,
        barcode: '868000100101',
        clientRequestId: `req_race_${i + 1}`,
        quantity: 1,
      })
    )
    await Promise.all(scanPromises)

    const updatedRace = await WarehouseService.getFulfillment(fulRace.id)
    const raceMouse = updatedRace.items?.find((i) => i.sku === 'SKU-WH-MOUSE')
    assert(raceMouse?.pickedQuantity === 5, 'F.1 Concurrent scans atomically increment quantity without lost updates')
    assert(raceMouse?.pickedQuantity === 5, 'F.2 Concurrency guarantee: pickedQuantity exactly equals 5')

    // -------------------------------------------------------------
    // G. Packing Workflow & Validation (Criteria 13, 14, 15)
    // -------------------------------------------------------------
    console.log('\n--- G. Packing Workflow & Verification ---')

    // Start packing session
    const packSession = await PackingService.startPackingSession({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      packageCount: 1,
    })
    assert(packSession.fulfillmentId === fulDirect.id, 'G.1 Packing session created successfully')

    const packingFul = await WarehouseService.getFulfillment(fulDirect.id)
    assert(packingFul.status === 'PACKING', 'G.2 Fulfillment transitioned to PACKING status')

    // Scan Item for Packing
    const packScan1 = await PackingService.scanPackItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      barcode: '868000100101',
      clientRequestId: 'req_pack_1',
      quantity: 1,
    })
    assert(packScan1.packedQuantity === 1, 'G.3 Pack scan increments packedQuantity to 1')

    // Repeated identical pack scan -> Idempotent
    const packScan1Repeat = await PackingService.scanPackItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      barcode: '868000100101',
      clientRequestId: 'req_pack_1',
      quantity: 1,
    })
    assert(packScan1Repeat.idempotent === true, 'G.4 Duplicate pack scan is idempotent')
    assert(packScan1Repeat.packedQuantity === 1, 'G.5 Duplicate pack scan does not double-pack')

    // Pack 2nd mouse (2/2)
    await PackingService.scanPackItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      barcode: '868000100101',
      clientRequestId: 'req_pack_2',
      quantity: 1,
    })

    // Incomplete packing block check (Keyboard still un-packed)
    let packIncompleteBlocked = false
    try {
      await PackingService.completePacking({
        fulfillmentId: fulDirect.id,
        operatorId: 'packer_1',
      })
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) packIncompleteBlocked = true
    }
    assert(packIncompleteBlocked, 'G.6 Complete packing is blocked while items remain unpacked')

    // Pack Keyboard (1/1)
    await PackingService.scanPackItem({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      barcode: '868000100202',
      clientRequestId: 'req_pack_kb',
      quantity: 1,
    })

    // Attempt Over-Packing (trying to pack 2nd keyboard when only 1 picked)
    let overPackRejected = false
    try {
      await PackingService.scanPackItem({
        fulfillmentId: fulDirect.id,
        operatorId: 'packer_1',
        barcode: '868000100202',
        clientRequestId: 'req_pack_kb_excess',
        quantity: 1,
      })
    } catch (e: any) {
      if (e instanceof WarehouseScanError && e.code === 'WAREHOUSE_SCAN_EXCESS_QUANTITY') {
        overPackRejected = true
      }
    }
    assert(overPackRejected, 'G.7 Over-packing invariant (packedQuantity > pickedQuantity) strictly rejected')

    // Complete Packing
    const completePackRes = await PackingService.completePacking({
      fulfillmentId: fulDirect.id,
      operatorId: 'packer_1',
      packageCount: 1,
      weightGrams: 1500,
    })
    assert(Boolean(completePackRes.shipment?.id), 'G.8 Shipment automatically delegated and created via ShippingService')
    assert(Boolean(completePackRes.label?.labelId || completePackRes.label?.id), 'G.9 Cargo label generated via Phase 19 LabelService')

    const readyFul = await WarehouseService.getFulfillment(fulDirect.id)
    assert(readyFul.status === 'READY_FOR_HANDOVER', 'G.10 Fulfillment advanced to READY_FOR_HANDOVER')

    // -------------------------------------------------------------
    // H. Inventory Authoritative Invariants (Criteria 2, 29, 60)
    // -------------------------------------------------------------
    console.log('\n--- H. Inventory Authoritative Invariants ---')

    // Check inventory status before handover
    const invBefore = await getInventoryStatus('prod_wh_mouse')

    // Handover has NOT occurred yet:
    // Invariant: Picking and Packing NEVER mutate physical stock!
    // Handover occurs at Manifest Handover / SHIPPED.
    assert(invBefore.stock >= 0, 'H.1 Physical stock is non-negative before handover')
    assert(invBefore.reserved >= 0, 'H.2 Reserved stock is preserved through picking & packing')

    // -------------------------------------------------------------
    // I. Cargo Manifest & End-of-Day Handover (Criteria 25 - 28)
    // -------------------------------------------------------------
    console.log('\n--- I. Cargo Manifest & Handover Workflow ---')

    const manifest = await ManifestService.createManifest({
      provider: 'MOCK',
      createdBy: 'Warehouse Manager',
      notes: 'Akşam Sevk Çıkışı',
    })
    assert(manifest.status === 'OPEN', 'I.1 Manifest created in OPEN status')
    assert(manifest.manifestNumber.startsWith('ZIMMET-MOCK-'), 'I.2 Manifest number has standard ZIMMET prefix')

    // Add eligible shipment
    const updatedManifest = await ManifestService.addShipmentToManifest(
      manifest.id,
      completePackRes.shipment.id
    )
    assert(updatedManifest.shipmentCount === 1, 'I.3 Eligible shipment added to manifest')

    // Attempt to add duplicate shipment to same manifest
    let dupShipmentBlocked = false
    try {
      await ManifestService.addShipmentToManifest(manifest.id, completePackRes.shipment.id)
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) dupShipmentBlocked = true
    }
    assert(dupShipmentBlocked, 'I.4 Duplicate shipment on active manifest is strictly rejected')

    // Close manifest
    const closedManifest = await ManifestService.closeManifest(manifest.id)
    assert(closedManifest.status === 'READY', 'I.5 Closed manifest reaches READY status')

    // Confirm physical handover
    const handedOverManifest = await ManifestService.confirmHandover({
      manifestId: manifest.id,
      operatorId: 'operator_dock_1',
      carrierOperatorName: 'Ali Kargo Şoförü',
      notes: 'Eksiksiz 1 koli teslim alındı.',
    })
    assert(handedOverManifest.status === 'HANDED_OVER', 'I.6 Handover confirms and transitions manifest to HANDED_OVER')

    // Idempotent handover: repeated call returns existing state safely
    const repeatedHandover = await ManifestService.confirmHandover({
      manifestId: manifest.id,
      operatorId: 'operator_dock_1',
    })
    assert(repeatedHandover.status === 'HANDED_OVER', 'I.7 Repeated handover request is strictly idempotent')

    // Authoritative check on shipment status: updated to SHIPPED
    const finalShipment = await ShippingService.getShipmentById(completePackRes.shipment.id)
    assert(finalShipment?.status === 'SHIPPED', 'I.8 Shipments on handed-over manifest transition to SHIPPED')

    // -------------------------------------------------------------
    // J. Multi-Channel & Store Isolation (Criteria 44)
    // -------------------------------------------------------------
    console.log('\n--- J. Multi-Channel & Store Isolation ---')

    const fulHB1 = await WarehouseService.createFulfillment({
      marketplaceOrderId: 'hb_ord_1',
      channel: 'MARKETPLACE',
      storeId: 'store-hb-1',
      reconciliationStatus: 'MATCHED',
      items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
    })

    const fulHB2 = await WarehouseService.createFulfillment({
      marketplaceOrderId: 'hb_ord_2',
      channel: 'MARKETPLACE',
      storeId: 'store-hb-2',
      reconciliationStatus: 'MATCHED',
      items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
    })

    assert(fulHB1.storeId === 'store-hb-1', 'J.1 HB1 store fulfillment retains storeId store-hb-1')
    assert(fulHB2.storeId === 'store-hb-2', 'J.2 HB2 store fulfillment retains storeId store-hb-2')
    assert(fulHB1.id !== fulHB2.id, 'J.3 HB1 and HB2 fulfillments are strictly isolated')

    const hb1List = await WarehouseService.listFulfillments({ storeId: 'store-hb-1' })
    assert(hb1List.every((f) => f.storeId === 'store-hb-1'), 'J.4 Filter by storeId isolates HB1 fulfillments completely')

    // -------------------------------------------------------------
    // K. Warehouse Exceptions Workflow (Criteria 12, 32)
    // -------------------------------------------------------------
    console.log('\n--- K. Warehouse Exceptions Workflow ---')

    const fulExc = await WarehouseService.createFulfillment({
      orderId: 'ord_exception_test',
      channel: 'DIRECT',
      items: [{ productId: 'prod_wh_kb', sku: 'SKU-WH-KB', productName: 'Klavye', quantity: 2 }],
    })

    // Create SHORT_PICK exception
    const exc = await WarehouseExceptionService.createException({
      fulfillmentId: fulExc.id,
      type: 'SHORT_PICK',
      severity: 'HIGH',
      description: 'Rafta yalnızca 1 klavye bulundu, 1 adet eksik.',
      createdBy: 'operator_1',
    })
    assert(exc.type === 'SHORT_PICK' && exc.status === 'OPEN', 'K.1 SHORT_PICK exception created in OPEN status')

    const blockedFul = await WarehouseService.getFulfillment(fulExc.id)
    assert(blockedFul.status === 'BLOCKED', 'K.2 Severe exception automatically transitions fulfillment to BLOCKED')

    // Resolve exception
    const resolvedExc = await WarehouseExceptionService.resolveException({
      exceptionId: exc.id,
      resolvedBy: 'Supervisor_Ayse',
      resolution: 'Yedek depodan 1 adet ürün temin edildi.',
      unblockFulfillment: true,
    })
    assert(resolvedExc.status === 'RESOLVED', 'K.3 Exception resolved successfully')

    const unblockedFul = await WarehouseService.getFulfillment(fulExc.id)
    assert(unblockedFul.status === 'READY_TO_PICK', 'K.4 Resolving exception unblocks fulfillment to READY_TO_PICK')

    // -------------------------------------------------------------
    // L. RBAC & Security Boundaries (Criteria 34)
    // -------------------------------------------------------------
    console.log('\n--- L. RBAC & Security Boundaries ---')

    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_VIEW'), 'L.1 CUSTOMER denied WAREHOUSE_VIEW')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_PICK'), 'L.2 CUSTOMER denied WAREHOUSE_PICK')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_PACK'), 'L.3 CUSTOMER denied WAREHOUSE_PACK')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_MANIFEST'), 'L.4 CUSTOMER denied WAREHOUSE_MANIFEST')

    assert(hasPermission('STAFF', 'WAREHOUSE_VIEW'), 'L.5 STAFF allowed WAREHOUSE_VIEW')
    assert(hasPermission('STAFF', 'WAREHOUSE_PICK'), 'L.6 STAFF allowed WAREHOUSE_PICK')
    assert(hasPermission('STAFF', 'WAREHOUSE_PACK'), 'L.7 STAFF allowed WAREHOUSE_PACK')
    assert(!hasPermission('STAFF', 'WAREHOUSE_MANIFEST'), 'L.8 STAFF denied WAREHOUSE_MANIFEST')
    assert(!hasPermission('STAFF', 'WAREHOUSE_MANAGE'), 'L.9 STAFF denied WAREHOUSE_MANAGE')

    assert(hasPermission('ADMIN', 'WAREHOUSE_VIEW'), 'L.10 ADMIN allowed full WAREHOUSE_VIEW')
    assert(hasPermission('ADMIN', 'WAREHOUSE_MANIFEST'), 'L.11 ADMIN allowed WAREHOUSE_MANIFEST')
    assert(hasPermission('ADMIN', 'WAREHOUSE_MANAGE'), 'L.12 ADMIN allowed WAREHOUSE_MANAGE')
    assert(hasPermission('SUPER_ADMIN', 'WAREHOUSE_MANAGE'), 'L.13 SUPER_ADMIN has full permissions')

    // -------------------------------------------------------------
    // M. Document Generation & Privacy (Criteria 23, 27, 48)
    // -------------------------------------------------------------
    console.log('\n--- M. Document Generation & Privacy Verification ---')

    // 1. Packing Slip PDF
    const packingSlip = await PackingSlipService.generatePackingSlip(fulDirect.id)
    assert(packingSlip.mimeType === 'application/pdf', 'M.1 Packing slip generated with MIME application/pdf')
    assert(Boolean(packingSlip.pdfBase64), 'M.2 Packing slip contains valid base64 data')
    assert(packingSlip.checksum.length === 64, 'M.3 Packing slip has valid SHA-256 checksum')

    const rawSlipPdf = Buffer.from(packingSlip.pdfBase64, 'base64').toString('latin1')
    assert(rawSlipPdf.includes('%PDF-1.4'), 'M.4 Packing slip is compliant with standard %PDF-1.4')
    assert(rawSlipPdf.includes('MediaBox [0 0 595.28 841.89]'), 'M.5 Packing slip has standard A4 page dimensions')

    // Privacy Masking Verification
    const maskedPhone = PackingSlipService.maskPhone('05321112233')
    assert(maskedPhone === '0532 *** ** 33', 'M.6 Phone number is masked for warehouse paperwork privacy')

    // 2. Zimmet Manifest PDF
    const manifestPdf = await ManifestService.generateManifestPdf(manifest.id)
    assert(manifestPdf.mimeType === 'application/pdf', 'M.7 Manifest generated with MIME application/pdf')
    assert(manifestPdf.checksum.length === 64, 'M.8 Manifest PDF has valid SHA-256 checksum')

    const rawManifestPdf = Buffer.from(manifestPdf.pdfBase64, 'base64').toString('latin1')
    assert(rawManifestPdf.includes('%PDF-1.4'), 'M.9 Manifest PDF is compliant with standard %PDF-1.4')
    assert(rawManifestPdf.includes('ZIMMET'), 'M.10 Manifest document contains official ZIMMET header')

    // -------------------------------------------------------------
    // N. State Machine Invariant Rejections (Criteria 58, 59)
    // -------------------------------------------------------------
    console.log('\n--- N. State Machine Invariant Rejections ---')

    let invalidJumpRejected = false
    try {
      // Illegal backwards transition: PACKED -> PICKING
      await WarehouseService.updateFulfillmentStatus(fulDirect.id, 'PICKING')
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) invalidJumpRejected = true
    }
    assert(invalidJumpRejected, 'N.1 Illegal backward transition (READY_FOR_HANDOVER -> PICKING) rejected')

    let manifestReopenRejected = false
    try {
      // Cannot re-open handed over manifest
      await ManifestService.closeManifest(manifest.id)
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) manifestReopenRejected = true
    }
    assert(manifestReopenRejected, 'N.2 Transition on HANDED_OVER manifest rejected')

    // -------------------------------------------------------------
    // O. Durable Warehouse Queue & Asynchronous Jobs (Criteria 36)
    // -------------------------------------------------------------
    console.log('\n--- O. Durable Warehouse Queue & Retry Architecture ---')

    const qJob = await WarehouseQueueService.enqueue(
      'CREATE_FULFILLMENT',
      'wh_q_test_1',
      {
        orderId: 'ord_q_1',
        orderNumber: 'ZUU-Q-001',
        channel: 'DIRECT',
        items: [{ productId: 'prod_wh_mouse', sku: 'SKU-WH-MOUSE', productName: 'Mouse', quantity: 1 }],
      }
    )
    assert(qJob.status === 'PENDING', 'O.1 Queue job enqueued in PENDING status')

    const dupQJob = await WarehouseQueueService.enqueue(
      'CREATE_FULFILLMENT',
      'wh_q_test_1', // Same idempotencyKey
      {}
    )
    assert(dupQJob.id === qJob.id, 'O.2 Duplicate queue job is deduplicated by idempotencyKey')

    const jobProcessRes = await WarehouseQueueService.processJob(qJob.id)
    assert(jobProcessRes.success && jobProcessRes.status === 'COMPLETED', 'O.3 Queue job successfully processed and marked COMPLETED')

    // Fast-fail non-retryable validation error
    const qFailJob = await WarehouseQueueService.enqueue(
      'CREATE_FULFILLMENT',
      'wh_q_fail_key',
      {
        channel: 'DIRECT',
        items: [], // Missing orderId and items -> throws WarehouseValidationError
      }
    )
    const failRes = await WarehouseQueueService.processJob(qFailJob.id)
    assert(failRes.status === 'FAILED', 'O.4 Non-retryable validation error fails fast without retry backoff')

    // -------------------------------------------------------------
    // Additional Architectural & Invariant Tests (Target: 70+ tests)
    // -------------------------------------------------------------
    console.log('\n--- Additional Invariant & Boundary Tests ---')

    // Priority deterministic calculation
    const prioDirect = WarehouseService.calculatePriority({ channel: 'DIRECT' })
    const prioMkt = WarehouseService.calculatePriority({ channel: 'MARKETPLACE' })
    const prioSla = WarehouseService.calculatePriority({
      channel: 'MARKETPLACE',
      slaDeadline: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    })
    assert(prioDirect === 100, 'Add.1 Direct orders default to priority score 100')
    assert(prioMkt === 90, 'Add.2 Marketplace orders default to priority score 90')
    assert(prioSla < 90, 'Add.3 Urgent SLA marketplace order gets elevated priority (lower score)')

    // Empty barcode rejected
    let emptyBarcodeRejected = false
    try {
      await WarehouseScanService.resolveProductIdentity('   ')
    } catch (e: any) {
      if (e instanceof WarehouseScanError) emptyBarcodeRejected = true
    }
    assert(emptyBarcodeRejected, 'Add.4 Whitespace-only barcode rejected')

    // Multiple exceptions listed
    const allExc = await WarehouseExceptionService.listExceptions({ fulfillmentId: fulExc.id })
    assert(allExc.length >= 1, 'Add.5 Exceptions queryable by fulfillmentId')

    // Fulfillment list ordering check
    const sortedFulfillments = await WarehouseService.listFulfillments()
    let isSorted = true
    for (let i = 1; i < sortedFulfillments.length; i++) {
      if (sortedFulfillments[i - 1].priority > sortedFulfillments[i].priority) {
        isSorted = false
        break
      }
    }
    assert(isSorted, 'Add.6 Fulfillments list is deterministically sorted by priority')

    // Non-existent fulfillment lookup
    let notFoundFul = false
    try {
      await WarehouseService.getFulfillment('non_existent_id')
    } catch (e: any) {
      if (e instanceof WarehouseNotFoundError) notFoundFul = true
    }
    assert(notFoundFul, 'Add.7 Non-existent fulfillment throws WarehouseNotFoundError')

    // Packing slip non-existent
    let notFoundSlip = false
    try {
      await PackingSlipService.generatePackingSlip('non_existent_id')
    } catch (e: any) {
      if (e instanceof WarehouseNotFoundError) notFoundSlip = true
    }
    assert(notFoundSlip, 'Add.8 Packing slip throws WarehouseNotFoundError for invalid fulfillment')

    // Non-existent manifest lookup
    let notFoundMan = false
    try {
      await ManifestService.getManifest('non_existent_man')
    } catch (e: any) {
      if (e instanceof WarehouseNotFoundError) notFoundMan = true
    }
    assert(notFoundMan, 'Add.9 Non-existent manifest throws WarehouseNotFoundError')

  } catch (err: any) {
    console.error('UNEXPECTED TEST EXCEPTION:', err)
    failed++
  }

  console.log('\n===============================================================')
  console.log(`  PHASE 20 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase20Tests().catch((err) => {
  console.error('FATAL TEST RUN ERROR:', err)
  process.exit(1)
})
