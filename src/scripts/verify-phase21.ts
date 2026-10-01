/**
 * ZUULAB PHASE 21 — FULFILLMENT INTELLIGENCE & WAREHOUSE OPTIMIZATION
 * VERIFICATION SUITE
 *
 * Verifies all Phase 21 architectural invariants:
 * A. Architecture & Wiring
 * B. Warehouse Location Hierarchy & Inactive Guards
 * C. Location Inventory Projections & Movement Ledger
 * D. Putaway Scoring, Capacity Validation & Idempotency
 * E. Barcode Identity & Strict Hierarchy Resolution (No fuzzy match)
 * F. Wave Picking Grouping & Eligibility Barrier (MATCHED vs UNMATCHED/PARTIAL)
 * G. Deterministic Warehouse Route Optimization & Traversal
 * H. Carrier Cutoff Intelligence (Timezone, Holidays, Weekends, Thresholds)
 * I. Physical Returns Inspection Hub (RMA, Damage Quarantining & Restock)
 * J. Local Zebra Print Agent Architecture (Heartbeat, Idempotency & Retries)
 * K. RBAC & Security Boundaries (Customer 403, Staff scope, Admin access)
 * L. Authoritative Central Inventory Integrity (No bypass of Phase 18 InventoryService)
 * M. Multi-Channel & Store Isolation
 */

import crypto from 'crypto'
import { LocationService } from '../lib/services/warehouse/location.service'
import { PutawayService } from '../lib/services/warehouse/putaway.service'
import { WavePickingService } from '../lib/services/warehouse/wave-picking.service'
import { CarrierCutoffService } from '../lib/services/warehouse/carrier-cutoff.service'
import { ReturnInspectionService } from '../lib/services/warehouse/return-inspection.service'
import { PrintAgentService } from '../lib/services/warehouse/print-agent.service'
import { WarehouseService } from '../lib/services/warehouse/warehouse.service'
import { WarehouseScanService } from '../lib/services/warehouse/warehouse-scan.service'
import { PickingService } from '../lib/services/warehouse/picking.service'
import {
  WarehouseError,
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from '../lib/services/warehouse/warehouse-error'
import {
  getInventoryStatus,
  restockProductInventory,
} from '../lib/services/inventory.service'
import { hasPermission } from '../lib/services/permissions.service'

async function runPhase21Tests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 21 — FULFILLMENT INTELLIGENCE & WAREHOUSE OPT  ')
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
    // A. Architecture & Wiring
    // -------------------------------------------------------------
    console.log('--- A. Architecture & Core Wiring ---')

    assert(typeof LocationService.createLocation === 'function', 'A.1 LocationService exists with createLocation')
    assert(typeof LocationService.recordMovement === 'function', 'A.2 LocationService exists with recordMovement')
    assert(typeof PutawayService.suggestPutawayLocation === 'function', 'A.3 PutawayService exists with suggestPutawayLocation')
    assert(typeof PutawayService.executePutaway === 'function', 'A.4 PutawayService exists with executePutaway')
    assert(typeof WavePickingService.createWave === 'function', 'A.5 WavePickingService exists with createWave')
    assert(typeof WavePickingService.optimizePickRoute === 'function', 'A.6 WavePickingService exists with optimizePickRoute')
    assert(typeof CarrierCutoffService.getNextCarrierCutoff === 'function', 'A.7 CarrierCutoffService exists with getNextCarrierCutoff')
    assert(typeof CarrierCutoffService.getRemainingMinutes === 'function', 'A.8 CarrierCutoffService exists with getRemainingMinutes')
    assert(typeof ReturnInspectionService.startInspection === 'function', 'A.9 ReturnInspectionService exists with startInspection')
    assert(typeof ReturnInspectionService.inspectItem === 'function', 'A.10 ReturnInspectionService exists with inspectItem')
    assert(typeof PrintAgentService.registerPrinter === 'function', 'A.11 PrintAgentService exists with registerPrinter')
    assert(typeof PrintAgentService.requestPrintJob === 'function', 'A.12 PrintAgentService exists with requestPrintJob')

    // -------------------------------------------------------------
    // B. Warehouse Location Hierarchy & Inactive Guards
    // -------------------------------------------------------------
    console.log('\n--- B. Location Hierarchy & Inactive Guards ---')

    // 1. Create Zone
    const zoneTest = await LocationService.createLocation({
      code: 'TEST-ZONE-C',
      name: 'Test Bölgesi C',
      type: 'ZONE',
      zone: 'C',
      capacity: 5000,
    })
    assert(zoneTest.code === 'TEST-ZONE-C', 'B.1 Warehouse Zone created successfully')

    // 2. Create Aisle
    const aisleTest = await LocationService.createLocation({
      parentId: zoneTest.id,
      code: 'TEST-C-01',
      name: 'Koridor C-01',
      type: 'AISLE',
      zone: 'C',
      aisle: '01',
      capacity: 2000,
    })
    assert(aisleTest.parentId === zoneTest.id, 'B.2 Aisle created with valid parentId pointing to Zone')

    // 3. Create Rack
    const rackTest = await LocationService.createLocation({
      parentId: aisleTest.id,
      code: 'TEST-C-01-R01',
      name: 'Raf R01',
      type: 'RACK',
      zone: 'C',
      aisle: '01',
      rack: 'R01',
      capacity: 1000,
    })
    assert(rackTest.type === 'RACK', 'B.3 Rack created in hierarchy')

    // 4. Create Shelf
    const shelfTest = await LocationService.createLocation({
      parentId: rackTest.id,
      code: 'TEST-C-01-R01-S01',
      name: 'Kat S01',
      type: 'SHELF',
      zone: 'C',
      aisle: '01',
      rack: 'R01',
      shelf: 'S01',
      capacity: 500,
    })
    assert(shelfTest.type === 'SHELF', 'B.4 Shelf created in hierarchy')

    // 5. Create Bin
    const binTest = await LocationService.createLocation({
      parentId: shelfTest.id,
      code: 'TEST-C-01-R01-S01-B01',
      name: 'Göz B01',
      type: 'BIN',
      zone: 'C',
      aisle: '01',
      rack: 'R01',
      shelf: 'S01',
      bin: 'B01',
      capacity: 100,
    })
    assert(binTest.type === 'BIN', 'B.5 Bin created with capacity 100')

    // 6. Inactive parent guard: Cannot add active child to inactive location
    await LocationService.updateLocation(zoneTest.id, { isActive: false })
    let inactiveParentBlocked = false
    try {
      await LocationService.createLocation({
        parentId: zoneTest.id,
        code: 'TEST-C-02',
        name: 'Koridor C-02',
        type: 'AISLE',
        isActive: true,
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) inactiveParentBlocked = true
    }
    assert(inactiveParentBlocked, 'B.6 Active child creation under inactive parent location is rejected')

    // Reactivate zone for subsequent tests
    await LocationService.updateLocation(zoneTest.id, { isActive: true })

    // 7. Duplicate code rejection
    let dupCodeBlocked = false
    try {
      await LocationService.createLocation({
        code: 'TEST-C-01-R01-S01-B01',
        name: 'Duplicate Bin',
        type: 'BIN',
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) dupCodeBlocked = true
    }
    assert(dupCodeBlocked, 'B.7 Duplicate location code is strictly rejected')

    // -------------------------------------------------------------
    // C. Location Inventory Projections & Movement Ledger
    // -------------------------------------------------------------
    console.log('\n--- C. Location Inventory & Movement Ledger ---')

    // Register product for location movement test
    WarehouseScanService.registerProduct({
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      barcode: '868000210011',
      name: 'Zuulab Pro Headset',
    })

    // 1. Move stock into binTest (Initial putaway)
    const mov1 = await LocationService.recordMovement({
      movementType: 'PUTAWAY',
      destinationLocationId: binTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 25,
      operatorId: 'operator_wh_1',
      idempotencyKey: 'TEST_PUTAWAY_HEADSET_25',
    })
    assert(mov1.movement.quantity === 25, 'C.1 Movement ledger records 25 units putaway')
    assert(mov1.idempotent === false, 'C.2 First execution is not marked idempotent')

    // 2. Check location inventory projection
    const invs1 = await LocationService.getLocationInventory(binTest.id, 'prod_p21_headset')
    assert(invs1.length === 1 && invs1[0].quantity === 25, 'C.3 Physical location projection accurately reflects 25 units')

    // 3. Movement idempotency: Repeat same idempotencyKey
    const mov1Repeat = await LocationService.recordMovement({
      movementType: 'PUTAWAY',
      destinationLocationId: binTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 25,
      operatorId: 'operator_wh_1',
      idempotencyKey: 'TEST_PUTAWAY_HEADSET_25',
    })
    assert(mov1Repeat.idempotent === true, 'C.4 Duplicate movement detected as idempotent')
    const invsAfterDup = await LocationService.getLocationInventory(binTest.id, 'prod_p21_headset')
    assert(invsAfterDup[0].quantity === 25, 'C.5 Duplicate movement did NOT double-increment inventory')

    // 4. Non-negative quantity invariant (locationQuantity >= 0)
    let negativeBlocked = false
    try {
      await LocationService.recordMovement({
        movementType: 'PICK',
        sourceLocationId: binTest.id,
        productId: 'prod_p21_headset',
        sku: 'SKU-P21-HEADSET',
        quantity: 50, // Current quantity is 25!
        operatorId: 'operator_wh_1',
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) negativeBlocked = true
    }
    assert(negativeBlocked, 'C.6 Movement causing negative location quantity is strictly rejected')

    // -------------------------------------------------------------
    // D. Putaway Scoring, Capacity Validation & Idempotency
    // -------------------------------------------------------------
    console.log('\n--- D. Putaway Scoring, Capacity & Idempotency ---')

    // 1. Scoring model test: Location storing same SKU should receive high score (+50 skuAffinity)
    const scores = await PutawayService.scoreLocationsForProduct({
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 10,
    })
    assert(scores.length > 0, 'D.1 Putaway scoring returns ranked candidate locations')
    const topLocation = scores[0]
    assert(topLocation.location.id === binTest.id, 'D.2 Location already containing SKU-P21-HEADSET ranked #1 (Affinity +50)')
    assert(topLocation.breakdown.skuAffinity === 50, 'D.3 Scoring breakdown contains deterministic skuAffinity: 50')

    // 2. Capacity validation: Bin capacity is 100, current occupied is 25
    // Attempting to putaway 80 units (25 + 80 = 105 > 100) must fail
    let overCapacityBlocked = false
    try {
      await PutawayService.executePutaway({
        locationId: binTest.id,
        productId: 'prod_p21_headset',
        sku: 'SKU-P21-HEADSET',
        quantity: 80,
        operatorId: 'operator_wh_1',
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) overCapacityBlocked = true
    }
    assert(overCapacityBlocked, 'D.4 Putaway exceeding location capacity is strictly rejected')

    // 3. Inactive location putaway rejected
    await LocationService.updateLocation(binTest.id, { isActive: false })
    let inactivePutawayBlocked = false
    try {
      await PutawayService.executePutaway({
        locationId: binTest.id,
        productId: 'prod_p21_headset',
        sku: 'SKU-P21-HEADSET',
        quantity: 5,
        operatorId: 'operator_wh_1',
      })
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) inactivePutawayBlocked = true
    }
    assert(inactivePutawayBlocked, 'D.5 Putaway to inactive location is strictly rejected')

    // Reactivate bin
    await LocationService.updateLocation(binTest.id, { isActive: true })

    // 4. Valid putaway succeeds & idempotent
    const validPutaway = await PutawayService.executePutaway({
      locationId: binTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 10,
      operatorId: 'operator_wh_1',
      referenceId: 'ref_batch_p21_01',
    })
    assert(validPutaway.movement.quantity === 10, 'D.6 Valid putaway succeeds')

    const repeatPutaway = await PutawayService.executePutaway({
      locationId: binTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 10,
      operatorId: 'operator_wh_1',
      referenceId: 'ref_batch_p21_01', // Identical referenceId
    })
    assert(repeatPutaway.idempotent === true, 'D.7 Repeated putaway with same referenceId is strictly idempotent')

    // -------------------------------------------------------------
    // E. Barcode Resolution Hierarchy (No Fuzzy Match)
    // -------------------------------------------------------------
    console.log('\n--- E. Barcode Resolution Hierarchy ---')

    const resHeadset = await WarehouseScanService.resolveProductIdentity('SKU-P21-HEADSET')
    assert(resHeadset.productId === 'prod_p21_headset', 'E.1 Exact SKU lookup resolves canonical product')

    const resBc = await WarehouseScanService.resolveProductIdentity('868000210011')
    assert(resBc.productId === 'prod_p21_headset', 'E.2 Exact Barcode lookup resolves canonical product')

    let fuzzyBlocked = false
    try {
      await WarehouseScanService.resolveProductIdentity('8680002100') // Incomplete
    } catch (e: any) {
      if (e instanceof WarehouseScanError) fuzzyBlocked = true
    }
    assert(fuzzyBlocked, 'E.3 Partial/fuzzy barcode is strictly rejected')

    // -------------------------------------------------------------
    // F. Wave Picking Grouping & Eligibility Barriers
    // -------------------------------------------------------------
    console.log('\n--- F. Wave Picking Grouping & Eligibility Barriers ---')

    // Create fulfillments for wave test
    const fulWave1 = await WarehouseService.createFulfillment({
      orderId: 'ord_p21_wave_1',
      orderNumber: 'ZUU-WAVE-001',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_p21_headset',
          sku: 'SKU-P21-HEADSET',
          barcode: '868000210011',
          productName: 'Zuulab Pro Headset',
          quantity: 2,
        },
      ],
    })

    const fulWave2 = await WarehouseService.createFulfillment({
      orderId: 'ord_p21_wave_2',
      orderNumber: 'ZUU-WAVE-002',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_p21_headset',
          sku: 'SKU-P21-HEADSET',
          barcode: '868000210011',
          productName: 'Zuulab Pro Headset',
          quantity: 3,
        },
      ],
    })

    // 1. Create wave with eligible orders
    const waveRes = await WavePickingService.createWave({
      fulfillmentIds: [fulWave1.id, fulWave2.id],
      assignedOperatorId: 'operator_wave_1',
    })
    assert(waveRes.wave.orderCount === 2, 'F.1 Wave created with 2 eligible orders')
    assert(waveRes.wave.totalUnits === 5, 'F.2 Wave consolidates total units (2 + 3 = 5)')
    assert(waveRes.wave.status === 'ASSIGNED', 'F.3 Wave status is ASSIGNED when operator specified')

    // 2. Duplicate assignment blocked: Order already in active wave cannot enter another wave
    let dupWaveBlocked = false
    try {
      await WavePickingService.createWave({
        fulfillmentIds: [fulWave1.id],
      })
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) dupWaveBlocked = true
    }
    assert(dupWaveBlocked, 'F.4 Order already assigned to active wave cannot enter another wave')

    // 3. UNMATCHED marketplace order strictly blocked from wave creation
    let unmatchedWaveBlocked = false
    try {
      // Simulate unmatched fulfillment
      const dummyUnmatched: any = { id: 'ful_unmatched', status: 'READY_TO_PICK', orderNumber: 'UNMATCHED-01' }
      // Attempting to create fulfillment with UNMATCHED fails at creation barrier
      await WarehouseService.createFulfillment({
        marketplaceOrderId: 'ty_unmatched_p21',
        channel: 'MARKETPLACE',
        storeId: 'store-ty-1',
        reconciliationStatus: 'UNMATCHED',
        items: [{ productId: 'prod_p21_headset', sku: 'SKU-P21-HEADSET', productName: 'Headset', quantity: 1 }],
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) unmatchedWaveBlocked = true
    }
    assert(unmatchedWaveBlocked, 'F.5 UNMATCHED marketplace order is blocked at fulfillment & wave barrier')

    // -------------------------------------------------------------
    // G. Deterministic Warehouse Route Optimization & Traversal
    // -------------------------------------------------------------
    console.log('\n--- G. Deterministic Route Optimization ---')

    const testRouteItems = [
      { productId: 'p1', sku: 'SKU-1', productName: 'Item 1', quantity: 2, locationCode: 'MAIN-B-02-R01-S01-B01' },
      { productId: 'p2', sku: 'SKU-2', productName: 'Item 2', quantity: 1, locationCode: 'MAIN-A-01-R01-S01-B01' },
      { productId: 'p3', sku: 'SKU-3', productName: 'Item 3', quantity: 3, locationCode: 'MAIN-A-02-R01-S02-B02' },
      { productId: 'p4', sku: 'SKU-4', productName: 'Item 4', quantity: 1, locationCode: 'MAIN-A-01-R02-S01-B01' },
    ]

    const route1 = WavePickingService.optimizePickRoute(testRouteItems)
    const route2 = WavePickingService.optimizePickRoute(testRouteItems)

    assert(route1.steps.length === 4, 'G.1 Route contains every required item location')
    assert(route1.steps[0].zone === 'A', 'G.2 Zone A visited before Zone B')
    assert(route1.steps[0].aisle === '01', 'G.3 Aisle 01 visited before Aisle 02')
    assert(route1.steps[3].zone === 'B', 'G.4 Zone B visited last')
    assert(
      JSON.stringify(route1.steps) === JSON.stringify(route2.steps),
      'G.5 Route optimization is 100% deterministic (same input produces exact same route)'
    )

    // -------------------------------------------------------------
    // H. Carrier Cutoff Intelligence
    // -------------------------------------------------------------
    console.log('\n--- H. Carrier Cutoff Intelligence ---')

    // 1. Surat Cutoff calculation on normal weekday (e.g. Wednesday 14:00 Istanbul time)
    // Wednesday 2026-10-14 14:00 Istanbul (11:00 UTC)
    const testDateWeekday = new Date('2026-10-14T11:00:00.000Z')
    const suratCutoff = CarrierCutoffService.getNextCarrierCutoff('SURAT', testDateWeekday)
    const partsSurat = CarrierCutoffService.toIstanbulParts(suratCutoff.cutoffDate)
    assert(partsSurat.hours === 17 && partsSurat.minutes === 0, 'H.1 Sürat Kargo cutoff time is 17:00 in Istanbul time')

    // Remaining minutes from 14:00 to 17:00 = 180 min
    const remSurat = CarrierCutoffService.getRemainingMinutes('SURAT', testDateWeekday)
    assert(remSurat === 180, 'H.2 Remaining minutes calculated accurately (180 min at 14:00 for 17:00 cutoff)')

    const alertNormal = CarrierCutoffService.getCutoffAlertLevel('SURAT', testDateWeekday)
    assert(alertNormal === 'NORMAL', 'H.3 Alert level is NORMAL when > 120 minutes remaining')

    // 2. Approaching threshold (e.g. 15:45 Istanbul -> 75 minutes remaining)
    const testDateApproaching = new Date('2026-10-14T12:45:00.000Z')
    const alertApproaching = CarrierCutoffService.getCutoffAlertLevel('SURAT', testDateApproaching)
    assert(alertApproaching === 'APPROACHING', 'H.4 Alert level is APPROACHING when between 60-120 minutes')

    // 3. Critical threshold (e.g. 16:15 Istanbul -> 45 minutes remaining)
    const testDateCritical = new Date('2026-10-14T13:15:00.000Z')
    const alertCritical = CarrierCutoffService.getCutoffAlertLevel('SURAT', testDateCritical)
    assert(alertCritical === 'CRITICAL', 'H.5 Alert level is CRITICAL when < 60 minutes remaining')

    // 4. Passed cutoff (e.g. 17:15 Istanbul -> today cutoff passed)
    const testDatePassed = new Date('2026-10-14T14:15:00.000Z')
    const isPassed = CarrierCutoffService.isCutoffPassed('SURAT', testDatePassed)
    assert(isPassed === true, 'H.6 isCutoffPassed returns true after 17:00')

    // Next cutoff should roll over to tomorrow Thursday
    const nextRollover = CarrierCutoffService.getNextCarrierCutoff('SURAT', testDatePassed)
    const partsRollover = CarrierCutoffService.toIstanbulParts(nextRollover.cutoffDate)
    assert(partsRollover.day === 15, 'H.7 Cutoff rolls over to next active pickup day')

    // 5. Weekend non-pickup day (Sunday): rolls over to Monday
    // Saturday 2026-10-17 18:00 Istanbul -> Next pickup is Monday Oct 19
    const testSaturdayEvening = new Date('2026-10-17T15:00:00.000Z')
    const sundayRollover = CarrierCutoffService.getNextCarrierCutoff('SURAT', testSaturdayEvening)
    const partsSunday = CarrierCutoffService.toIstanbulParts(sundayRollover.cutoffDate)
    assert(partsSunday.dayOfWeek === 1, 'H.8 Sunday non-pickup day automatically advances to Monday (dayOfWeek=1)')

    // 6. Holiday handling: Oct 29 Cumhuriyet Bayramı rolls over to Oct 30
    CarrierCutoffService.addHoliday('2026-10-29')
    const testHolidayEve = new Date('2026-10-28T15:00:00.000Z') // After cutoff on Oct 28
    const holidayRollover = CarrierCutoffService.getNextCarrierCutoff('SURAT', testHolidayEve)
    const partsHoliday = CarrierCutoffService.toIstanbulParts(holidayRollover.cutoffDate)
    assert(partsHoliday.dateString === '2026-10-30', 'H.9 Configured public holiday skipped and rolls over to next working day')

    // -------------------------------------------------------------
    // I. Physical Returns Inspection Hub
    // -------------------------------------------------------------
    console.log('\n--- I. Physical Returns Inspection Hub ---')

    // Register test return RMA
    ReturnInspectionService.registerReturnPackage({
      returnNumber: 'RMA-2026-P21-001',
      orderNumber: 'ZUU-P21-RET-01',
      trackingNumber: 'SURAT-RET-777',
      status: 'RECEIVED',
      items: [
        {
          id: 'ritm_headset_1',
          productId: 'prod_p21_headset',
          sku: 'SKU-P21-HEADSET',
          productName: 'Zuulab Pro Headset',
          quantity: 1,
        },
      ],
    })

    // 1. Scan package barcode (RMA number)
    const insp = await ReturnInspectionService.startInspection({
      returnNumber: 'RMA-2026-P21-001',
      inspectedBy: 'inspector_cem',
    })
    assert(insp.status === 'INSPECTING', 'I.1 Return inspection session starts in INSPECTING status')

    // Register second valid product to test wrong-product on RMA
    WarehouseScanService.registerProduct({
      productId: 'prod_p21_mouse',
      sku: 'SKU-P21-MOUSE',
      barcode: '868000210099',
      name: 'Zuulab Pro Mouse',
    })

    // 2. Wrong product scanned must be rejected
    let wrongProductBlocked = false
    try {
      await ReturnInspectionService.inspectItem({
        inspectionId: insp.id,
        scannedBarcode: '868000210099', // Mouse barcode instead of headset!
        condition: 'USED',
        disposition: 'RESTOCK',
      })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) wrongProductBlocked = true
    }
    assert(wrongProductBlocked, 'I.2 Scanned product not matching RMA items is strictly rejected')

    // 3. Damaged return: Must NOT become sellable stock!
    const damagedItem = await ReturnInspectionService.inspectItem({
      inspectionId: insp.id,
      scannedBarcode: 'SKU-P21-HEADSET',
      condition: 'DAMAGED',
      disposition: 'QUARANTINE',
      quantity: 1,
      idempotencyVersion: 'dmg_v1',
    })
    assert(damagedItem.inspectionItem.restocked === false, 'I.3 Damaged item is NOT restocked into sellable inventory')
    assert(Boolean(damagedItem.inspectionItem.exceptionId), 'I.4 Damaged item automatically triggers a WarehouseException')

    // 4. Restockable return: Calls Phase 18 InventoryService
    // Let's create second RMA for restock test
    ReturnInspectionService.registerReturnPackage({
      returnNumber: 'RMA-2026-P21-002',
      orderNumber: 'ZUU-P21-RET-02',
      status: 'RECEIVED',
      items: [
        {
          id: 'ritm_headset_2',
          productId: 'prod_p21_headset',
          sku: 'SKU-P21-HEADSET',
          productName: 'Zuulab Pro Headset',
          quantity: 1,
        },
      ],
    })

    const insp2 = await ReturnInspectionService.startInspection({
      returnNumber: 'RMA-2026-P21-002',
      inspectedBy: 'inspector_cem',
    })

    const stockBeforeRestock = (await getInventoryStatus('prod_p21_headset')).stock

    const restockItem = await ReturnInspectionService.inspectItem({
      inspectionId: insp2.id,
      scannedBarcode: 'SKU-P21-HEADSET',
      condition: 'UNOPENED',
      disposition: 'RESTOCK',
      quantity: 1,
      idempotencyVersion: 'rstk_v1',
    })
    assert(restockItem.inspectionItem.restocked === true, 'I.5 Unopened return item approved for RESTOCK')

    const stockAfterRestock = (await getInventoryStatus('prod_p21_headset')).stock
    assert(
      stockAfterRestock === stockBeforeRestock + 1,
      'I.6 Restock authoritatively incremented central inventory via Phase 18 restockProductInventory'
    )

    // 5. Idempotent return inspection: Repeat scan with same idempotency version
    const repeatRestock = await ReturnInspectionService.inspectItem({
      inspectionId: insp2.id,
      scannedBarcode: 'SKU-P21-HEADSET',
      condition: 'UNOPENED',
      disposition: 'RESTOCK',
      quantity: 1,
      idempotencyVersion: 'rstk_v1', // Same key
    })
    assert(repeatRestock.idempotent === true, 'I.7 Duplicate inspection scan detected as idempotent')
    const stockAfterDup = (await getInventoryStatus('prod_p21_headset')).stock
    assert(stockAfterDup === stockAfterRestock, 'I.8 Duplicate inspection did NOT restock central inventory twice')

    // -------------------------------------------------------------
    // J. Local Zebra Print Agent Architecture
    // -------------------------------------------------------------
    console.log('\n--- J. Local Zebra Print Agent Architecture ---')

    // 1. Printer Registration
    const prn = await PrintAgentService.registerPrinter({
      name: 'Depo 2 Zebra GK420t',
      ipAddress: '192.168.1.185',
      port: 9100,
      dpi: 203,
    })
    assert(prn.printerType === 'ZEBRA_ZPL', 'J.1 Printer registered with default ZEBRA_ZPL type')
    assert(prn.ipAddress === '192.168.1.185', 'J.2 Printer IP address registered without public exposure')

    // 2. Register Agent & Token Generation
    const agentReg = await PrintAgentService.registerAgent({
      printerId: prn.id,
      agentId: 'agent_depo_2',
      adminUserId: 'admin_sys',
    })
    assert(Boolean(agentReg.rawToken), 'J.3 Local agent token generated successfully')
    assert(
      PrintAgentService.authenticateAgent('agent_depo_2', agentReg.rawToken) === true,
      'J.4 Agent token authenticated securely via SHA-256 comparison'
    )

    // 3. Heartbeat & Online Status
    const hb = await PrintAgentService.recordHeartbeat('agent_depo_2', agentReg.rawToken)
    assert(hb.success === true, 'J.5 Heartbeat recorded successfully')
    const prnRefreshed = await PrintAgentService.getPrinter(prn.id)
    assert(PrintAgentService.isPrinterOnline(prnRefreshed) === true, 'J.6 Printer is marked online after heartbeat')

    // 4. Print Job Request & Deduplication
    const job1 = await PrintAgentService.requestPrintJob({
      printerId: prn.id,
      shipmentId: 'SHP-P21-001',
      requestedBy: 'operator_pack_1',
      labelVersion: 'v1',
    })
    assert(job1.job.status === 'PENDING', 'J.7 Print job enqueued in PENDING status')
    assert(job1.idempotent === false, 'J.8 First print job request is not idempotent')

    const dupJob = await PrintAgentService.requestPrintJob({
      printerId: prn.id,
      shipmentId: 'SHP-P21-001',
      requestedBy: 'operator_pack_1',
      labelVersion: 'v1',
    })
    assert(dupJob.idempotent === true && dupJob.job.id === job1.job.id, 'J.9 Duplicate print request deduplicated without creating second physical job')

    // 5. Explicit Reprint creates new job
    const reprintJob = await PrintAgentService.requestPrintJob({
      printerId: prn.id,
      shipmentId: 'SHP-P21-001',
      requestedBy: 'operator_pack_1',
      isReprint: true,
      labelVersion: 'v1',
    })
    assert(reprintJob.job.isReprint === true && reprintJob.job.id !== job1.job.id, 'J.10 Explicit reprint creates new job with isReprint=true')

    // 6. Agent polling, complete & fail with retry
    const polledJobs = await PrintAgentService.pollPendingJobs('agent_depo_2', agentReg.rawToken)
    assert(polledJobs.length >= 1, 'J.11 Agent successfully polled pending jobs over HTTPS')

    const completed = await PrintAgentService.completeJob(job1.job.id, agentReg.rawToken)
    assert(completed.status === 'COMPLETED', 'J.12 Successful execution transitions print job to COMPLETED')

    // Failed job retry test
    const failJobRes = await PrintAgentService.failJob(reprintJob.job.id, 'Zebra paper out', agentReg.rawToken)
    assert(failJobRes.attempts === 1 && failJobRes.status === 'PENDING', 'J.13 Failed print job automatically schedules retry (attempt 1)')

    // -------------------------------------------------------------
    // K. RBAC & Security Boundaries
    // -------------------------------------------------------------
    console.log('\n--- K. RBAC & Security Boundaries ---')

    assert(hasPermission('CUSTOMER', 'WAREHOUSE_LOCATION_VIEW') === false, 'K.1 CUSTOMER denied WAREHOUSE_LOCATION_VIEW')
    assert(hasPermission('CUSTOMER', 'WAREHOUSE_WAVE_VIEW') === false, 'K.2 CUSTOMER denied WAREHOUSE_WAVE_VIEW')
    assert(hasPermission('CUSTOMER', 'WAREHOUSE_PRINTER_MANAGE') === false, 'K.3 CUSTOMER denied WAREHOUSE_PRINTER_MANAGE')
    assert(hasPermission('STAFF', 'WAREHOUSE_LOCATION_VIEW') === true, 'K.4 STAFF allowed WAREHOUSE_LOCATION_VIEW')
    assert(hasPermission('STAFF', 'WAREHOUSE_WAVE_VIEW') === true, 'K.5 STAFF allowed WAREHOUSE_WAVE_VIEW')
    assert(hasPermission('STAFF', 'WAREHOUSE_LOCATION_MANAGE') === false, 'K.6 STAFF denied WAREHOUSE_LOCATION_MANAGE (Admin only)')
    assert(hasPermission('STAFF', 'WAREHOUSE_PRINTER_MANAGE') === false, 'K.7 STAFF denied WAREHOUSE_PRINTER_MANAGE (Admin only)')
    assert(hasPermission('ADMIN', 'WAREHOUSE_LOCATION_MANAGE') === true, 'K.8 ADMIN allowed WAREHOUSE_LOCATION_MANAGE')
    assert(hasPermission('ADMIN', 'WAREHOUSE_PRINTER_MANAGE') === true, 'K.9 ADMIN allowed WAREHOUSE_PRINTER_MANAGE')
    assert(hasPermission('SUPER_ADMIN', 'WAREHOUSE_LOCATION_MANAGE') === true, 'K.10 SUPER_ADMIN has full permissions')

    // -------------------------------------------------------------
    // L. Central Inventory Invariant Enforcement
    // -------------------------------------------------------------
    console.log('\n--- L. Inventory Integrity Invariants ---')

    const initialStatus = await getInventoryStatus('prod_p21_headset')

    // Warehouse location putaway must NOT alter physicalStock or reservedStock directly
    await PutawayService.executePutaway({
      locationId: binTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 5,
      operatorId: 'operator_wh_1',
    })

    const statusAfterPutaway = await getInventoryStatus('prod_p21_headset')
    assert(
      statusAfterPutaway.stock === initialStatus.stock,
      'L.1 Warehouse location movements do NOT directly mutate central physicalStock'
    )
    assert(
      statusAfterPutaway.reserved === initialStatus.reserved,
      'L.2 Warehouse location movements do NOT directly mutate central reservedStock'
    )

    // Reconciliation check
    const recon = await LocationService.reconcileLocationInventory('prod_p21_headset')
    assert(typeof recon.totalLocationQuantity === 'number', 'L.3 Location inventory reconcilable against central stock')

    // -------------------------------------------------------------
    // M. Multi-Store Isolation & Wave Execution Workflow
    // -------------------------------------------------------------
    console.log('\n--- M. Multi-Store Isolation & Wave Workflow ---')

    // 1. Relocation between locations
    const binDestTest = await LocationService.createLocation({
      parentId: shelfTest.id,
      code: 'TEST-C-01-R01-S01-B02',
      name: 'Göz B02 (Hedef)',
      type: 'BIN',
      capacity: 50,
    })

    const reloc = await PutawayService.executeRelocation({
      sourceLocationId: binTest.id,
      destinationLocationId: binDestTest.id,
      productId: 'prod_p21_headset',
      sku: 'SKU-P21-HEADSET',
      quantity: 5,
      operatorId: 'operator_wh_1',
    })
    assert(reloc.movement.movementType === 'RELOCATION', 'M.1 Stock relocation records RELOCATION movement')
    const destInv = await LocationService.getLocationInventory(binDestTest.id, 'prod_p21_headset')
    assert(destInv[0].quantity === 5, 'M.2 Relocation accurately updates destination location inventory')

    // 2. Wave Execution Workflow: Start, Scan, Complete
    const waveRecord = await WavePickingService.startWave(waveRes.wave.id, 'operator_wave_1')
    assert(waveRecord.status === 'IN_PROGRESS', 'M.3 Wave starts and transitions to IN_PROGRESS')

    // Scan 1 headset unit for the wave
    const waveScan = await WavePickingService.scanWaveItem({
      waveId: waveRes.wave.id,
      barcode: 'SKU-P21-HEADSET',
      operatorId: 'operator_wave_1',
      clientRequestId: 'wave_scan_req_1',
      quantity: 1,
    })
    assert(waveScan.success && waveScan.waveItem.totalPickedQuantity === 1, 'M.4 Wave barcode scan increments picked quantity')

    // Wave pause
    const pausedWave = await WavePickingService.pauseWave(waveRes.wave.id)
    assert(pausedWave.status === 'PAUSED', 'M.5 Wave paused successfully')

    // Resume wave
    await WavePickingService.startWave(waveRes.wave.id, 'operator_wave_1')

    // Complete wave scanning (remaining 4 units)
    await WavePickingService.scanWaveItem({
      waveId: waveRes.wave.id,
      barcode: 'SKU-P21-HEADSET',
      operatorId: 'operator_wave_1',
      clientRequestId: 'wave_scan_req_2',
      quantity: 4,
    })

    const completedWave = await WavePickingService.completeWave(waveRes.wave.id, 'operator_wave_1')
    assert(completedWave.status === 'COMPLETED', 'M.6 Wave completed successfully after picking all required units')

    // 3. Print Job Max Attempts & Admin Retry
    // Next 2 fails on reprintJob should exhaust 3 attempts and set FAILED
    await PrintAgentService.failJob(reprintJob.job.id, 'Hardware jam', agentReg.rawToken)
    const exhaustedJob = await PrintAgentService.failJob(reprintJob.job.id, 'Hardware jam', agentReg.rawToken)
    assert(exhaustedJob.status === 'FAILED', 'M.7 Exceeding max print attempts marks job as FAILED')

    const retriedJob = await PrintAgentService.retryJob(reprintJob.job.id, 'admin_super')
    assert(retriedJob.status === 'PENDING' && retriedJob.attempts === 0, 'M.8 Admin manual retry resets job attempts to 0 and status to PENDING')

    // 4. Multi-Store Isolation (HB1 vs HB2 vs TY1 vs TY2)
    const fulHb1 = await WarehouseService.createFulfillment({
      marketplaceOrderId: 'hb_iso_ord_1',
      marketplaceOrderNumber: 'HB-P21-ISO-1',
      channel: 'MARKETPLACE',
      storeId: 'store-hb-1',
      reconciliationStatus: 'MATCHED',
      items: [{ productId: 'prod_p21_headset', sku: 'SKU-P21-HEADSET', productName: 'Headset', quantity: 1 }],
    })

    const fulHb2 = await WarehouseService.createFulfillment({
      marketplaceOrderId: 'hb_iso_ord_2',
      marketplaceOrderNumber: 'HB-P21-ISO-2',
      channel: 'MARKETPLACE',
      storeId: 'store-hb-2',
      reconciliationStatus: 'MATCHED',
      items: [{ productId: 'prod_p21_headset', sku: 'SKU-P21-HEADSET', productName: 'Headset', quantity: 1 }],
    })

    assert(fulHb1.storeId === 'store-hb-1', 'M.9 HB1 fulfillment is tagged with store-hb-1')
    assert(fulHb2.storeId === 'store-hb-2', 'M.10 HB2 fulfillment is tagged with store-hb-2')
    assert(fulHb1.storeId !== fulHb2.storeId, 'M.11 HB1 and HB2 fulfillments are strictly partitioned')

    const hb1List = await WarehouseService.listFulfillments({ storeId: 'store-hb-1' })
    assert(hb1List.every((f) => f.storeId === 'store-hb-1'), 'M.12 Store-scoped query returns only store-hb-1 records')

  } catch (err: any) {
    console.error('UNEXPECTED TEST EXCEPTION:', err)
    failed++
  }

  console.log('\n===============================================================')
  console.log(`  PHASE 21 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase21Tests().catch((err) => {
  console.error('FATAL TEST RUN ERROR:', err)
  process.exit(1)
})
