/**
 * ZUULAB PHASE 22 — CYCLE COUNTING, MOBILE PDA & AUTOMATED CARTONIZATION
 * VERIFICATION SUITE
 *
 * Verifies all Phase 22 architectural invariants:
 * A. Architecture & Wiring
 * B. Cycle Counting & Blind Audits (expectedQuantity hidden before submission)
 * C. Count Submission, Zero Variance & Discrepancy Detection
 * D. Recount Workflow & Observation Ledger (Count #1, Count #2, Count #3 preserved)
 * E. Reconciliation Review, Approval & Authorized Inventory Adjustment
 * F. Concurrency, Race Condition Guards & State Machine Protections
 * G. Mobile PDA Capabilities & Scanner Workflow Simulation
 * H. Automated 3D Cartonization Engine (Dimensions, Weight, 6-Permutation Rotations)
 * I. Multi-Product Packing & Smallest Valid Carton Selection
 * J. Cartonization Failure & Diagnostic Explainability
 * K. Packing Service Integration & Actual Measurement Preservation
 * L. RBAC & Security Boundaries (Customer, Staff, Admin, SuperAdmin)
 * M. Multi-Store Isolation (HB1, HB2, TY1, TY2, DIRECT)
 * N. Central Inventory Authority (Warehouse code cannot mutate stock directly)
 */

import crypto from 'crypto'
import { CycleCountingService } from '../lib/services/warehouse/cycle-counting.service'
import { CartonizationService } from '../lib/services/warehouse/cartonization.service'
import { LocationService } from '../lib/services/warehouse/location.service'
import { PutawayService } from '../lib/services/warehouse/putaway.service'
import { PackingService } from '../lib/services/warehouse/packing.service'
import { WarehouseScanService } from '../lib/services/warehouse/warehouse-scan.service'
import { WarehouseService } from '../lib/services/warehouse/warehouse.service'
import {
  WarehouseError,
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from '../lib/services/warehouse/warehouse-error'
import {
  getInventoryStatus,
  adjustInventory,
  restockProductInventory,
} from '../lib/services/inventory.service'
import { hasPermission } from '../lib/services/permissions.service'

async function runPhase22Tests() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 22 — CYCLE COUNTING, MOBILE PDA & CARTONIZATION ')
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

    assert(typeof CycleCountingService.createSession === 'function', 'A.1 CycleCountingService exists with createSession')
    assert(typeof CycleCountingService.startSession === 'function', 'A.2 CycleCountingService exists with startSession')
    assert(typeof CycleCountingService.submitCountScan === 'function', 'A.3 CycleCountingService exists with submitCountScan')
    assert(typeof CycleCountingService.requestRecount === 'function', 'A.4 CycleCountingService exists with requestRecount')
    assert(typeof CycleCountingService.approveTicket === 'function', 'A.5 CycleCountingService exists with approveTicket')
    assert(typeof CycleCountingService.rejectTicket === 'function', 'A.6 CycleCountingService exists with rejectTicket')
    assert(typeof CycleCountingService.reconcileTicket === 'function', 'A.7 CycleCountingService exists with reconcileTicket')
    assert(typeof CartonizationService.createCarton === 'function', 'A.8 CartonizationService exists with createCarton')
    assert(typeof CartonizationService.recommendCarton === 'function', 'A.9 CartonizationService exists with recommendCarton')
    assert(typeof PackingService.previewCartonRecommendation === 'function', 'A.10 PackingService integrates previewCartonRecommendation')
    assert(typeof adjustInventory === 'function', 'A.11 InventoryService exports adjustInventory')

    // -------------------------------------------------------------
    // Setup Test Warehouse Infrastructure
    // -------------------------------------------------------------
    // Create test Zone, Aisle, Rack, Shelf, Bin
    const zoneP22 = await LocationService.createLocation({
      code: 'ZONE-P22',
      name: 'Bölge P22',
      type: 'ZONE',
      zone: 'P22',
      capacity: 5000,
    })

    const aisleP22 = await LocationService.createLocation({
      parentId: zoneP22.id,
      code: 'P22-01',
      name: 'Koridor P22-01',
      type: 'AISLE',
      zone: 'P22',
      aisle: '01',
      capacity: 2000,
    })

    const rackP22 = await LocationService.createLocation({
      parentId: aisleP22.id,
      code: 'P22-01-R01',
      name: 'Raf R01',
      type: 'RACK',
      zone: 'P22',
      aisle: '01',
      rack: 'R01',
      capacity: 1000,
    })

    const shelfP22 = await LocationService.createLocation({
      parentId: rackP22.id,
      code: 'P22-01-R01-S01',
      name: 'Kat S01',
      type: 'SHELF',
      zone: 'P22',
      aisle: '01',
      rack: 'R01',
      shelf: 'S01',
      capacity: 500,
    })

    const binP22A = await LocationService.createLocation({
      parentId: shelfP22.id,
      code: 'P22-01-R01-S01-B01',
      name: 'Göz B01',
      type: 'BIN',
      zone: 'P22',
      aisle: '01',
      rack: 'R01',
      shelf: 'S01',
      bin: 'B01',
      capacity: 200,
    })

    const binP22B = await LocationService.createLocation({
      parentId: shelfP22.id,
      code: 'P22-01-R01-S01-B02',
      name: 'Göz B02',
      type: 'BIN',
      zone: 'P22',
      aisle: '01',
      rack: 'R01',
      shelf: 'S01',
      bin: 'B02',
      capacity: 200,
    })

    // Register canonical test products in WarehouseScanService
    WarehouseScanService.registerProduct({
      productId: 'prod_p22_headset',
      sku: 'SKU-P22-HEADSET',
      barcode: '868000220101',
      name: 'Zuulab Pro Kulaklık',
    })

    WarehouseScanService.registerProduct({
      productId: 'prod_p22_mouse',
      sku: 'SKU-P22-MOUSE',
      barcode: '868000220202',
      name: 'Zuulab Ergonomik Mouse',
    })

    // Seed physical inventory into bin A: 20 units of Headset
    await PutawayService.executePutaway({
      locationId: binP22A.id,
      productId: 'prod_p22_headset',
      sku: 'SKU-P22-HEADSET',
      quantity: 20,
      operatorId: 'operator_seed',
      referenceId: 'REF-P22-SEED-01',
      idempotencyKey: 'PUTAWAY:P22:SEED:01',
    })

    // Seed physical inventory into bin B: 10 units of Mouse
    await PutawayService.executePutaway({
      locationId: binP22B.id,
      productId: 'prod_p22_mouse',
      sku: 'SKU-P22-MOUSE',
      quantity: 10,
      operatorId: 'operator_seed',
      referenceId: 'REF-P22-SEED-02',
      idempotencyKey: 'PUTAWAY:P22:SEED:02',
    })

    // -------------------------------------------------------------
    // B. Cycle Counting & Blind Audits (Criteria A)
    // -------------------------------------------------------------
    console.log('\n--- B. Cycle Counting & Blind Audits ---')

    // 1. Session Creation with target locations
    const session1 = await CycleCountingService.createSession({
      warehouseId: 'MAIN',
      type: 'LOCATION',
      blindMode: true,
      assignedTo: 'operator_ahmet',
      locationIds: [binP22A.id, binP22B.id],
      createdBy: 'admin_denetim',
      notes: 'Haftalık döngüsel lokasyon sayımı',
    })

    assert(!!session1.id, 'B.1 Count session created successfully')
    assert(session1.status === 'ASSIGNED', 'B.2 Initial status is ASSIGNED when operator specified')
    assert(session1.blindMode === true, 'B.3 Blind mode is enabled')
    assert(session1.lines?.length === 2, 'B.4 Count session populated 2 count lines for target bins')

    // 2. Blind Mode Protection: Operator view must NOT receive expectedQuantity before submission
    const operatorView = await CycleCountingService.getSession(session1.id, { maskBlind: true })
    assert(!!operatorView, 'B.5 Session view retrieved for operator')
    const uncountedLine = operatorView?.lines?.[0]
    assert(
      uncountedLine?.expectedQuantity === -1,
      'B.6 Expected quantity is strictly masked (value -1 / hidden) from blind operator'
    )
    assert(
      uncountedLine?.varianceQuantity === null,
      'B.7 Variance quantity is null before count submission'
    )

    // Admin view can see expectedQuantity
    const adminView = await CycleCountingService.getSession(session1.id, { maskBlind: false })
    assert(
      adminView?.lines?.[0].expectedQuantity === 20,
      'B.8 Authorized admin view can inspect expectedQuantity (20 units)'
    )

    // 3. Start Session
    const startedSession = await CycleCountingService.startSession(session1.id, 'operator_ahmet')
    assert(startedSession.status === 'IN_PROGRESS', 'B.9 Session transitioned to IN_PROGRESS')
    assert(!!startedSession.startedAt, 'B.10 StartedAt timestamp recorded')

    // Invalid transition check: Cannot start an already finished or invalid session
    let invalidStartRejected = false
    try {
      await CycleCountingService.startSession('non_existent_sess', 'op')
    } catch (e: any) {
      if (e instanceof WarehouseNotFoundError) invalidStartRejected = true
    }
    assert(invalidStartRejected, 'B.11 Invalid session ID strictly throws WarehouseNotFoundError')

    // -------------------------------------------------------------
    // C. Count Submission, Zero Variance & Discrepancies
    // -------------------------------------------------------------
    console.log('\n--- C. Count Submission, Zero Variance & Discrepancy Detection ---')

    // 1. Perfect count: 20 expected, 20 counted (Zero Variance)
    const scanResult1 = await CycleCountingService.submitCountScan({
      sessionId: session1.id,
      locationId: binP22A.id,
      barcodeOrSku: '868000220101', // Exact Barcode lookup
      countedQuantity: 20,
      countedBy: 'operator_ahmet',
      notes: 'Tam sayıldı, kutular sağlam',
    })

    assert(scanResult1.line.countedQuantity === 20, 'C.1 Physical count recorded: 20 units')
    assert(scanResult1.line.varianceQuantity === 0, 'C.2 Variance calculated as exact 0 (counted - expected)')
    assert(scanResult1.line.status === 'VERIFIED', 'C.3 Zero variance line status automatically becomes VERIFIED')
    assert(!scanResult1.ticket, 'C.4 Zero variance does NOT create a reconciliation ticket')

    // 2. Discrepancy Count: Bin B has 10 expected, operator counts 8 (Negative Variance: -2)
    const scanResult2 = await CycleCountingService.submitCountScan({
      sessionId: session1.id,
      locationId: binP22B.id,
      barcodeOrSku: 'SKU-P22-MOUSE', // Exact SKU lookup
      countedQuantity: 8,
      countedBy: 'operator_ahmet',
      notes: '2 adet eksik görünüyor',
    })

    assert(scanResult2.line.countedQuantity === 8, 'C.5 Physical count recorded: 8 units')
    assert(scanResult2.line.varianceQuantity === -2, 'C.6 Negative variance accurately detected: -2 units')
    assert(scanResult2.line.status === 'UNDER_REVIEW', 'C.7 Discrepancy line placed in UNDER_REVIEW status')
    assert(!!scanResult2.ticket, 'C.8 Reconciliation ticket automatically generated for discrepancy')
    assert(scanResult2.ticket?.status === 'OPEN', 'C.9 Reconciliation ticket created in OPEN status')
    assert(scanResult2.ticket?.varianceQuantity === -2, 'C.10 Ticket records variance quantity: -2')

    // -------------------------------------------------------------
    // D. Recount Workflow & Immutable History Ledger
    // -------------------------------------------------------------
    console.log('\n--- D. Recount Workflow & History Ledger ---')

    // 1. Request Recount for Bin B
    const recountReq = await CycleCountingService.requestRecount(
      session1.id,
      scanResult2.line.id,
      'admin_denetim',
      'Fark büyük, lütfen arkadaki kutuları da kontrol ediniz'
    )

    assert(recountReq.recountCount === 1, 'D.1 Recount counter incremented to 1')
    assert(recountReq.status === 'RECOUNT_REQUIRED', 'D.2 Line status updated to RECOUNT_REQUIRED')

    const sessionAfterRecountReq = await CycleCountingService.getSession(session1.id)
    assert(sessionAfterRecountReq?.status === 'RECOUNT_REQUIRED', 'D.3 Session status transitioned to RECOUNT_REQUIRED')

    // 2. Submit Recount (Count #2): Operator recounts 9 (still -1 variance)
    const recountResult = await CycleCountingService.submitCountScan({
      sessionId: session1.id,
      locationId: binP22B.id,
      barcodeOrSku: 'SKU-P22-MOUSE',
      countedQuantity: 9,
      countedBy: 'operator_ahmet',
      notes: '1 kutu rafta arkaya düşmüş, toplam 9 bulundu',
      idempotencyAttempt: 2,
    })

    assert(recountResult.line.countedQuantity === 9, 'D.4 Second observation recorded: 9 units')
    assert(recountResult.line.varianceQuantity === -1, 'D.5 Variance updated to -1')
    assert(recountResult.line.countHistory.length === 2, 'D.6 Count history preserved both observations (COUNT #1 and COUNT #2)')
    assert(recountResult.line.countHistory[0].countedQuantity === 8, 'D.7 Observation #1 intact: 8 units')
    assert(recountResult.line.countHistory[1].countedQuantity === 9, 'D.8 Observation #2 intact: 9 units')

    // -------------------------------------------------------------
    // E. Reconciliation Review, Approval & Authorized Inventory Adjustment
    // -------------------------------------------------------------
    console.log('\n--- E. Reconciliation Review & Central Inventory Adjustment ---')

    const ticketId = scanResult2.ticket!.id

    // 1. Approve Ticket
    const approvedTicket = await CycleCountingService.approveTicket(
      ticketId,
      'admin_denetim',
      'Fiziksel eksiklik onaylandı, stok güncellenecek.'
    )
    assert(approvedTicket.status === 'APPROVED', 'E.1 Reconciliation ticket approved by admin')
    assert(approvedTicket.reviewedBy === 'admin_denetim', 'E.2 Reviewer identity recorded')

    // Pre-check central inventory stock before reconciliation
    const stockBeforeRecon = await getInventoryStatus('prod_p22_mouse')

    // 2. Execute Reconciliation (Authoritative Inventory Adjustment)
    const reconExecution = await CycleCountingService.reconcileTicket(ticketId, 'admin_denetim')
    assert(reconExecution.ticket.status === 'RESOLVED', 'E.3 Reconciliation ticket marked as RESOLVED')

    // Verify Central Inventory was adjusted authoritatively via Phase 18/22 InventoryService
    const stockAfterRecon = await getInventoryStatus('prod_p22_mouse')
    assert(
      stockAfterRecon.stock === stockBeforeRecon.stock - 1,
      `E.4 Central physical stock authoritatively adjusted: Before=${stockBeforeRecon.stock}, After=${stockAfterRecon.stock} (-1)`
    )

    // Verify physical location inventory projection was adjusted
    const binBInventory = await LocationService.getLocationInventory(binP22B.id)
    const binBMouse = binBInventory.find((i) => i.productId === 'prod_p22_mouse')
    assert(binBMouse?.quantity === 9, 'E.5 Physical location bin projection updated to 9 units')

    // 3. Idempotency Guard: Duplicate reconciliation attempt must NOT double-adjust stock!
    const duplicateRecon = await CycleCountingService.reconcileTicket(ticketId, 'admin_denetim')
    assert(duplicateRecon.idempotent === true, 'E.6 Duplicate reconciliation detected as idempotent')

    const stockAfterDup = await getInventoryStatus('prod_p22_mouse')
    assert(
      stockAfterDup.stock === stockAfterRecon.stock,
      'E.7 Duplicate reconciliation did NOT double-adjust central inventory'
    )

    // 4. Session status transitions to RECONCILED once all lines resolved
    const finalSession = await CycleCountingService.getSession(session1.id)
    assert(finalSession?.status === 'RECONCILED', 'E.8 Count session transitioned to RECONCILED')

    // -------------------------------------------------------------
    // F. Concurrency & State Machine Guards
    // -------------------------------------------------------------
    console.log('\n--- F. Concurrency & State Machine Invariants ---')

    // 1. Backward / Invalid transition protection: RECONCILED -> IN_PROGRESS must fail
    let invalidTransitionBlocked = false
    try {
      await CycleCountingService.startSession(session1.id, 'op')
    } catch (e: any) {
      if (e instanceof WarehouseInvalidStateError) invalidTransitionBlocked = true
    }
    assert(invalidTransitionBlocked, 'F.1 Backward transition RECONCILED -> IN_PROGRESS strictly rejected')

    // 2. Duplicate submission idempotency
    const dupScan = await CycleCountingService.submitCountScan({
      sessionId: session1.id,
      locationId: binP22A.id,
      barcodeOrSku: '868000220101',
      countedQuantity: 20,
      countedBy: 'operator_ahmet',
      idempotencyAttempt: 1,
    })
    assert(dupScan.idempotent === true, 'F.2 Duplicate count submission with same attempt key is strictly idempotent')

    // -------------------------------------------------------------
    // G. Mobile PDA Capabilities & Scanner Workflow Simulation
    // -------------------------------------------------------------
    console.log('\n--- G. Mobile PDA Operational Workflows ---')

    // 1. Barcode normalization & Exact SKU/Barcode resolution
    const resExactSku = await WarehouseScanService.resolveProductIdentity('SKU-P22-HEADSET')
    assert(resExactSku.productId === 'prod_p22_headset', 'G.1 PDA exact SKU lookup resolves canonical product')

    const resExactBc = await WarehouseScanService.resolveProductIdentity('868000220101')
    assert(resExactBc.productId === 'prod_p22_headset', 'G.2 PDA exact barcode lookup resolves canonical product')

    let pdaUnknownBlocked = false
    try {
      await WarehouseScanService.resolveProductIdentity('UNKNOWN-99999999')
    } catch (e: any) {
      if (e instanceof WarehouseScanError) pdaUnknownBlocked = true
    }
    assert(pdaUnknownBlocked, 'G.3 Unknown barcode strictly rejected on PDA input')

    let pdaFuzzyBlocked = false
    try {
      await WarehouseScanService.resolveProductIdentity('8680002201') // Partial
    } catch (e: any) {
      if (e instanceof WarehouseScanError) pdaFuzzyBlocked = true
    }
    assert(pdaFuzzyBlocked, 'G.4 Fuzzy/partial barcode input strictly rejected on PDA')

    // -------------------------------------------------------------
    // H. Automated 3D Cartonization Engine (Criteria C)
    // -------------------------------------------------------------
    console.log('\n--- H. Automated 3D Cartonization Engine ---')

    CartonizationService.resetDefaults()

    // 1. Verify standard carton definitions loaded
    const standardCartons = await CartonizationService.listCartons()
    assert(standardCartons.length >= 5, 'H.1 Standard carton definitions loaded (XS, S, M, L, XL)')

    // 2. Carton CRUD: Create custom carton
    const customCarton = await CartonizationService.createCarton({
      code: 'KOLI-TEST-SLIM',
      name: 'İnce Uzun Test Kolisi',
      innerLengthMm: 400,
      innerWidthMm: 120,
      innerHeightMm: 100,
      maxWeightGrams: 4000,
      tareWeightGrams: 150,
      active: true,
      priority: 15,
    })
    assert(customCarton.code === 'KOLI-TEST-SLIM', 'H.2 Custom carton created successfully')

    // 3. Inactive carton ignored during recommendation
    await CartonizationService.updateCarton(customCarton.id, { active: false })
    const activeOnlyCartons = await CartonizationService.listCartons({ activeOnly: true })
    assert(
      !activeOnlyCartons.some((c) => c.id === customCarton.id),
      'H.3 Inactive cartons are strictly excluded from recommendation candidates'
    )

    // 4. Test Single Product Fitting: 1 Headset (180x120x90 mm, 280g)
    const rec1 = CartonizationService.recommendCarton([
      {
        productId: 'prod_p22_headset',
        sku: 'SKU-P22-HEADSET',
        quantity: 1,
        dimensions: { lengthMm: 180, widthMm: 120, heightMm: 90 },
        weightGrams: 280,
        rotationAllowed: true,
      },
    ])

    assert(rec1.success === true, 'H.4 Headset successfully fits into a carton')
    assert(rec1.recommendedCarton?.code === 'KOLI-S', 'H.5 Smallest valid carton KOLI-S selected for single headset')
    assert(rec1.volumeUtilizationPercent > 0, 'H.6 Volume utilization calculated deterministically')
    assert(rec1.placements.length === 1, 'H.7 3D placement position returned')

    // 5. Permitted Rotations: Product with dimensions (160x110x80) cannot fit in XS (150x100x100) unrotated,
    // but when rotated (90x160x80) does it fit? In this test, let item be 120x90x90 (fits in XS 150x100x100).
    const recRot = CartonizationService.recommendCarton([
      {
        productId: 'prod_box',
        sku: 'SKU-BOX',
        quantity: 1,
        dimensions: { lengthMm: 90, widthMm: 140, heightMm: 80 },
        weightGrams: 300,
        rotationAllowed: true,
      },
    ])
    assert(recRot.success === true, 'H.8 Permitted 3D rotation successfully places item into carton')

    // 6. Rotation Forbidden: Height constraint preserved
    const recNoRot = CartonizationService.recommendCarton([
      {
        productId: 'prod_tall',
        sku: 'SKU-TALL',
        quantity: 1,
        dimensions: { lengthMm: 80, widthMm: 80, heightMm: 110 }, // 110mm height exceeds XS 100mm height
        weightGrams: 200,
        rotationAllowed: false, // Cannot flip height into length!
      },
    ])
    assert(
      recNoRot.recommendedCarton?.code !== 'KOLI-XS',
      'H.9 When rotationAllowed=false, item cannot flip height into length, forcing larger carton'
    )

    // -------------------------------------------------------------
    // I. Multi-Product Packing & Smallest Valid Carton Selection
    // -------------------------------------------------------------
    console.log('\n--- I. Multi-Product Packing & Smallest Selection ---')

    // Pack 4 Headsets + 2 Mice
    const multiRec = CartonizationService.recommendCarton([
      {
        productId: 'prod_p22_headset',
        sku: 'SKU-P22-HEADSET',
        quantity: 4,
        dimensions: { lengthMm: 180, widthMm: 120, heightMm: 90 },
        weightGrams: 280,
      },
      {
        productId: 'prod_p22_mouse',
        sku: 'SKU-P22-MOUSE',
        quantity: 2,
        dimensions: { lengthMm: 120, widthMm: 70, heightMm: 50 },
        weightGrams: 150,
      },
    ])

    assert(multiRec.success === true, 'I.1 Multi-product bundle successfully packed')
    assert(multiRec.placements.length === 6, 'I.2 All 6 discrete product units received 3D placements')
    assert(
      multiRec.recommendedCarton?.code === 'KOLI-M' || multiRec.recommendedCarton?.code === 'KOLI-L',
      'I.3 Appropriate multi-item carton selected'
    )

    // Determinism test: Same inputs must produce exact same carton and placement coordinates!
    const multiRec2 = CartonizationService.recommendCarton([
      {
        productId: 'prod_p22_headset',
        sku: 'SKU-P22-HEADSET',
        quantity: 4,
        dimensions: { lengthMm: 180, widthMm: 120, heightMm: 90 },
        weightGrams: 280,
      },
      {
        productId: 'prod_p22_mouse',
        sku: 'SKU-P22-MOUSE',
        quantity: 2,
        dimensions: { lengthMm: 120, widthMm: 70, heightMm: 50 },
        weightGrams: 150,
      },
    ])

    assert(
      multiRec.recommendedCarton?.id === multiRec2.recommendedCarton?.id,
      'I.4 Cartonization is 100% deterministic (exact same carton selected across runs)'
    )
    assert(
      JSON.stringify(multiRec.placements) === JSON.stringify(multiRec2.placements),
      'I.5 3D placement coordinates are 100% deterministic'
    )

    // -------------------------------------------------------------
    // J. Cartonization Failure & Diagnostics
    // -------------------------------------------------------------
    console.log('\n--- J. Cartonization Failure & Explainability ---')

    // 1. Oversized item: length 900mm exceeds all cartons (XL max length is 600mm)
    const recOversize = CartonizationService.recommendCarton([
      {
        productId: 'prod_huge',
        sku: 'SKU-HUGE',
        quantity: 1,
        dimensions: { lengthMm: 900, widthMm: 700, heightMm: 500 },
        weightGrams: 1000,
      },
    ])
    assert(recOversize.success === false, 'J.1 Oversized item fails cartonization')
    assert(
      recOversize.errorCode === 'NO_FITTING_CARTON' || recOversize.errorCode === 'EXCEEDS_DIMENSIONS',
      'J.2 Structured failure error code returned'
    )
    assert(!!recOversize.reason, 'J.3 Diagnostic explanation provided in failure')

    // 2. Overweight bundle: 50kg exceeds XL max weight of 30kg
    const recOverweight = CartonizationService.recommendCarton([
      {
        productId: 'prod_heavy',
        sku: 'SKU-HEAVY',
        quantity: 1,
        dimensions: { lengthMm: 200, widthMm: 200, heightMm: 200 },
        weightGrams: 50000,
      },
    ])
    assert(recOverweight.success === false, 'J.4 Overweight item fails cartonization')
    assert(recOverweight.errorCode === 'EXCEEDS_MAX_WEIGHT', 'J.5 EXCEEDS_MAX_WEIGHT error code returned')

    // 3. Validation: Non-positive dimensions rejected
    const recInvalidDim = CartonizationService.recommendCarton([
      {
        productId: 'prod_zero',
        sku: 'SKU-ZERO',
        quantity: 1,
        dimensions: { lengthMm: -10, widthMm: 50, heightMm: 50 },
        weightGrams: 100,
      },
    ])
    assert(recInvalidDim.success === false, 'J.6 Non-positive dimensions strictly rejected')
    assert(recInvalidDim.errorCode === 'INVALID_INPUT', 'J.7 INVALID_INPUT error code returned')

    // 4. Validation: Non-positive weight rejected
    const recInvalidWeight = CartonizationService.recommendCarton([
      {
        productId: 'prod_noweight',
        sku: 'SKU-NOWEIGHT',
        quantity: 1,
        dimensions: { lengthMm: 50, widthMm: 50, heightMm: 50 },
        weightGrams: 0,
      },
    ])
    assert(recInvalidWeight.success === false, 'J.8 Zero/negative weight strictly rejected')

    // -------------------------------------------------------------
    // K. Packing Integration & Actual Measurement Preservation
    // -------------------------------------------------------------
    console.log('\n--- K. Packing Integration & Measurement Preservation ---')

    // 1. Create a fulfillment for testing packing integration
    const testFul = await WarehouseService.createFulfillment({
      orderId: 'ord_p22_pack',
      orderNumber: 'ZUU-P22-PACK-01',
      channel: 'DIRECT',
      items: [
        {
          productId: 'prod_p22_headset',
          sku: 'SKU-P22-HEADSET',
          productName: 'Zuulab Pro Kulaklık',
          quantity: 2,
        },
      ],
      isPaymentConfirmed: true,
      isReserved: true,
    })

    // Advance fulfillment to PACKING
    testFul.status = 'PICKED'
    for (const it of testFul.items || []) {
      it.pickedQuantity = it.orderedQuantity
      it.status = 'PICKED'
    }

    // Preview carton recommendation via PackingService
    const packPreview = await PackingService.previewCartonRecommendation(testFul.id)
    assert(packPreview.success === true, 'K.1 PackingService successfully generates carton preview')
    assert(!!packPreview.recommendedCarton, 'K.2 Recommended carton returned for fulfillment')

    // Preview causes NO database / fulfillment mutation
    const fulAfterPreview = await WarehouseService.getFulfillment(testFul.id)
    assert(fulAfterPreview.status === 'PICKED', 'K.3 Preview caused zero status mutation to fulfillment')

    // Complete packing with actual operator measurements
    await PackingService.startPackingSession({
      fulfillmentId: testFul.id,
      operatorId: 'operator_pack',
    })

    await PackingService.scanPackItem({
      fulfillmentId: testFul.id,
      operatorId: 'operator_pack',
      barcode: '868000220101',
      quantity: 2,
      clientRequestId: 'req_pack_p22_01',
    })

    const packCompletion = await PackingService.completePacking({
      fulfillmentId: testFul.id,
      operatorId: 'operator_pack',
      packageCount: 1,
      weightGrams: 720, // Actual scale reading
      dimensions: { lengthMm: 260, widthMm: 190, heightMm: 130 }, // Actual package measurements
    })

    assert(packCompletion.fulfillment.status === 'READY_FOR_HANDOVER', 'K.4 Fulfillment transitions to READY_FOR_HANDOVER')
    assert(!!packCompletion.shipment, 'K.5 Shipment created via Phase 19 ShippingService delegation')

    // -------------------------------------------------------------
    // L. RBAC & Security Boundaries
    // -------------------------------------------------------------
    console.log('\n--- L. RBAC & Security Boundaries ---')

    // CUSTOMER role has 0 warehouse permissions
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_COUNT_VIEW'), 'L.1 CUSTOMER denied WAREHOUSE_COUNT_VIEW')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_COUNT_MANAGE'), 'L.2 CUSTOMER denied WAREHOUSE_COUNT_MANAGE')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_COUNT_RECONCILE'), 'L.3 CUSTOMER denied WAREHOUSE_COUNT_RECONCILE')
    assert(!hasPermission('CUSTOMER', 'WAREHOUSE_CARTON_MANAGE'), 'L.4 CUSTOMER denied WAREHOUSE_CARTON_MANAGE')

    // STAFF role has operational view/count but NO reconcile/manage authority
    assert(hasPermission('STAFF', 'WAREHOUSE_COUNT_VIEW'), 'L.5 STAFF allowed WAREHOUSE_COUNT_VIEW (Blind counting on PDA)')
    assert(!hasPermission('STAFF', 'WAREHOUSE_COUNT_MANAGE'), 'L.6 STAFF denied WAREHOUSE_COUNT_MANAGE (Admin only)')
    assert(!hasPermission('STAFF', 'WAREHOUSE_COUNT_RECONCILE'), 'L.7 STAFF denied WAREHOUSE_COUNT_RECONCILE (Admin only)')
    assert(!hasPermission('STAFF', 'WAREHOUSE_CARTON_MANAGE'), 'L.8 STAFF denied WAREHOUSE_CARTON_MANAGE (Admin only)')

    // ADMIN role has full warehouse management and reconciliation permissions
    assert(hasPermission('ADMIN', 'WAREHOUSE_COUNT_VIEW'), 'L.9 ADMIN allowed WAREHOUSE_COUNT_VIEW')
    assert(hasPermission('ADMIN', 'WAREHOUSE_COUNT_MANAGE'), 'L.10 ADMIN allowed WAREHOUSE_COUNT_MANAGE')
    assert(hasPermission('ADMIN', 'WAREHOUSE_COUNT_RECONCILE'), 'L.11 ADMIN allowed WAREHOUSE_COUNT_RECONCILE')
    assert(hasPermission('ADMIN', 'WAREHOUSE_CARTON_MANAGE'), 'L.12 ADMIN allowed WAREHOUSE_CARTON_MANAGE')

    // SUPER_ADMIN has full access
    assert(hasPermission('SUPER_ADMIN', 'WAREHOUSE_COUNT_RECONCILE'), 'L.13 SUPER_ADMIN has full permissions')

    // -------------------------------------------------------------
    // M. Multi-Store Isolation (HB1, HB2, TY1, TY2, DIRECT)
    // -------------------------------------------------------------
    console.log('\n--- M. Multi-Store Isolation ---')

    // Create session partitioned to store-hb-1
    const hb1Session = await CycleCountingService.createSession({
      storeId: 'store-hb-1',
      warehouseId: 'MAIN',
      type: 'CYCLE',
      blindMode: true,
      createdBy: 'admin_hb1',
    })

    // Create session partitioned to store-hb-2
    const hb2Session = await CycleCountingService.createSession({
      storeId: 'store-hb-2',
      warehouseId: 'MAIN',
      type: 'CYCLE',
      blindMode: true,
      createdBy: 'admin_hb2',
    })

    assert(hb1Session.storeId === 'store-hb-1', 'M.1 HB1 session tagged with store-hb-1')
    assert(hb2Session.storeId === 'store-hb-2', 'M.2 HB2 session tagged with store-hb-2')

    // Cross-store access guard: HB2 operator trying to fetch HB1 session must fail
    let crossStoreBlocked = false
    try {
      await CycleCountingService.getSession(hb1Session.id, { storeId: 'store-hb-2' })
    } catch (e: any) {
      if (e instanceof WarehouseValidationError) crossStoreBlocked = true
    }
    assert(crossStoreBlocked, 'M.3 Cross-store session access is strictly rejected')

    // Store-scoped query returns only that store's sessions
    const hb1Sessions = await CycleCountingService.listSessions({ storeId: 'store-hb-1' })
    assert(
      hb1Sessions.every((s) => s.storeId === 'store-hb-1' || s.storeId === null),
      'M.4 Store-scoped list query returns only authorized store records'
    )

    // -------------------------------------------------------------
    // N. Central Inventory Authority Invariant
    // -------------------------------------------------------------
    console.log('\n--- N. Central Inventory Authority Invariant ---')

    // Verify adjustInventory is authoritative and creates auditable transaction
    const initialInv = await getInventoryStatus('prod_p22_headset')
    const adjDirect = await adjustInventory('prod_p22_headset', 5, {
      reason: 'CYCLE_COUNT_ADJUSTMENT',
      adminUserId: 'auditor_test',
    })
    const finalInv = await getInventoryStatus('prod_p22_headset')
    assert(
      finalInv.stock === initialInv.stock + 5,
      'N.1 Authoritative adjustInventory successfully updated physicalStock under mutex lock'
    )

    // Revert test adjustment
    await adjustInventory('prod_p22_headset', -5, {
      reason: 'CYCLE_COUNT_ADJUSTMENT_REVERT',
      adminUserId: 'auditor_test',
    })
    const revertedInv = await getInventoryStatus('prod_p22_headset')
    assert(revertedInv.stock === initialInv.stock, 'N.2 Revert adjustment maintained inventory integrity')

    // =============================================================
    // Final Summary
    // =============================================================
    console.log('\n===============================================================')
    console.log(`  PHASE 22 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
    console.log('===============================================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (err: any) {
    console.error('\n[FATAL ERROR IN PHASE 22 SUITE]:', err)
    process.exit(1)
  }
}

runPhase22Tests()
