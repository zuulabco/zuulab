import {
  calculateMaterialCost,
  classifyCostDataCompleteness,
  calculateProductionCost,
  calculateContribution,
  evaluateChannelEconomics,
  roundMoney,
  validateCostInputs,
  getProductCostProfile,
  updateProductCostProfile,
  getProductEconomics,
  getChannelComparison,
  getMaterials,
  saveMaterial,
  getMaterialPriceHistory,
  getChannelFeeConfigs,
  saveChannelFeeConfig,
  getHistoricalSalesEconomics,
  getEconomicsSummary,
} from '../lib/services/product-economics.service'
import {
  hasPermission,
} from '../lib/services/permissions.service'
import {
  getInventoryStatus,
} from '../lib/services/inventory.service'
import {
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
  stockProductionOrder,
} from '../lib/services/production.service'
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
  console.log('  ZUULAB PHASE 24 — PRODUCT ECONOMICS & PROFITABILITY')
  console.log('===============================================================\n')

  // ─────────────────────────────────────────────────────────────
  // A. Architecture & Core Exports
  // ─────────────────────────────────────────────────────────────
  console.log('--- A. Architecture & Core Wiring ---')

  assert(typeof calculateMaterialCost === 'function', 'A.1', 'calculateMaterialCost exported')
  assert(typeof classifyCostDataCompleteness === 'function', 'A.2', 'classifyCostDataCompleteness exported')
  assert(typeof calculateProductionCost === 'function', 'A.3', 'calculateProductionCost exported')
  assert(typeof calculateContribution === 'function', 'A.4', 'calculateContribution exported')
  assert(typeof evaluateChannelEconomics === 'function', 'A.5', 'evaluateChannelEconomics exported')
  assert(typeof roundMoney === 'function', 'A.6', 'roundMoney exported')
  assert(typeof validateCostInputs === 'function', 'A.7', 'validateCostInputs exported')
  assert(typeof getProductCostProfile === 'function', 'A.8', 'getProductCostProfile exported')
  assert(typeof updateProductCostProfile === 'function', 'A.9', 'updateProductCostProfile exported')
  assert(typeof getProductEconomics === 'function', 'A.10', 'getProductEconomics exported')
  assert(typeof getChannelComparison === 'function', 'A.11', 'getChannelComparison exported')
  assert(typeof getMaterials === 'function', 'A.12', 'getMaterials exported')
  assert(typeof saveMaterial === 'function', 'A.13', 'saveMaterial exported')
  assert(typeof getChannelFeeConfigs === 'function', 'A.14', 'getChannelFeeConfigs exported')
  assert(typeof saveChannelFeeConfig === 'function', 'A.15', 'saveChannelFeeConfig exported')
  assert(typeof getHistoricalSalesEconomics === 'function', 'A.16', 'getHistoricalSalesEconomics exported')
  assert(typeof getEconomicsSummary === 'function', 'A.17', 'getEconomicsSummary exported')

  // ─────────────────────────────────────────────────────────────
  // B. Money Architecture & Decimal Arithmetic
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- B. Money Architecture & Precision ---')

  assert(roundMoney(0.1 + 0.2) === 0.3, 'B.1', 'Floating point 0.1+0.2 deterministically rounded to 0.3')
  assert(roundMoney(46.537291) === 46.54, 'B.2', 'Fake precision 46.537291 rounded to 46.54 TL')
  assert(roundMoney(0.004) === 0, 'B.3', 'Sub-cent fraction rounds down properly')
  assert(roundMoney(0.005) === 0.01, 'B.4', 'Half-cent fraction rounds up properly')

  const valNegWeight = validateCostInputs({ weightGrams: -10 })
  assert(!valNegWeight.valid && valNegWeight.errors.length > 0, 'B.5', 'Negative weight rejected')

  const valNegPrice = validateCostInputs({ pricePerKgTl: -500 })
  assert(!valNegPrice.valid && valNegPrice.errors.length > 0, 'B.6', 'Negative pricePerKg rejected')

  const valNegPack = validateCostInputs({ packagingCostTl: -5 })
  assert(!valNegPack.valid, 'B.7', 'Negative packaging cost rejected')

  const valInvalidComm = validateCostInputs({ commissionPercent: 125 })
  assert(!valInvalidComm.valid, 'B.8', 'Commission > 100% rejected')

  const valNegComm = validateCostInputs({ commissionPercent: -5 })
  assert(!valNegComm.valid, 'B.9', 'Commission < 0% rejected')

  const valValid = validateCostInputs({
    weightGrams: 35,
    pricePerKgTl: 700,
    packagingCostTl: 6,
    otherProductionCostTl: 2,
    commissionPercent: 18,
  })
  assert(valValid.valid && valValid.errors.length === 0, 'B.10', 'Valid inputs pass validation cleanly')

  // ─────────────────────────────────────────────────────────────
  // C. Material Cost Calculation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- C. Material Cost Formula & Gaps ---')

  // Formula: (35 / 1000) * 700 = 24.50 TL
  const matCost1 = calculateMaterialCost(35, 700)
  assert(matCost1 === 24.5, 'C.1', '35g PLA at 700 TL/kg = 24.50 TL')

  // 120g PETG at 750 TL/kg = 90.00 TL
  const matCost2 = calculateMaterialCost(120, 750)
  assert(matCost2 === 90, 'C.2', '120g PETG at 750 TL/kg = 90.00 TL')

  // 0g material = 0 TL
  const matCostZero = calculateMaterialCost(0, 700)
  assert(matCostZero === 0, 'C.3', 'Explicit 0g produces 0 TL')

  // Missing weight should NOT guess; returns null
  const matCostNoWeight = calculateMaterialCost(null, 700)
  assert(matCostNoWeight === null, 'C.4', 'Missing weight returns null (not zero)')

  // Missing price should NOT guess; returns null
  const matCostNoPrice = calculateMaterialCost(35, null)
  assert(matCostNoPrice === null, 'C.5', 'Missing price returns null (not zero)')

  // Negative weight throws or returns invalid
  let threwNeg = false
  try {
    calculateMaterialCost(-5, 700)
  } catch {
    threwNeg = true
  }
  assert(threwNeg, 'C.6', 'Negative weight rejected in pure material calculation')

  // ─────────────────────────────────────────────────────────────
  // D. Production Cost Breakdown & Data Completeness
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- D. Production Cost Breakdown ---')

  // Total: 24.50 + 6.00 + 2.00 = 32.50 TL
  const prodCostFull = calculateProductionCost(24.5, 6, 2)
  assert(prodCostFull.totalCostTl === 32.5, 'D.1', 'Total production cost: 24.50 + 6.00 + 2.00 = 32.50 TL')
  assert(prodCostFull.status === 'COMPLETE', 'D.2', 'Complete data status assigned when all fields present')
  assert(prodCostFull.missingFields.length === 0, 'D.3', 'No missing fields reported for complete data')

  // Partial: missing packaging
  const prodCostNoPack = calculateProductionCost(24.5, null, 2)
  assert(prodCostNoPack.totalCostTl === 26.5, 'D.4', 'Partial total sums known components: 24.50 + 2.00 = 26.50 TL')
  assert(prodCostNoPack.status === 'PARTIAL', 'D.5', 'Partial status assigned when packaging is missing')
  assert(prodCostNoPack.missingFields.includes('Paketleme Maliyeti'), 'D.6', 'Missing packaging field identified')

  // Missing: all null
  const prodCostAllNull = calculateProductionCost(null, null, null)
  assert(prodCostAllNull.totalCostTl === null, 'D.7', 'All null returns null total (never silently assumes zero)')
  assert(prodCostAllNull.status === 'MISSING', 'D.8', 'Missing status assigned when all components null')

  // Completeness classifier
  const classComp = classifyCostDataCompleteness({
    weightGrams: 50,
    pricePerKgTl: 700,
    packagingCostTl: 5,
    otherProductionCostTl: 3,
  })
  assert(classComp.status === 'COMPLETE', 'D.9', 'Completeness classifier marks complete profile')

  const classPart = classifyCostDataCompleteness({
    weightGrams: 50,
    pricePerKgTl: 700,
    packagingCostTl: null,
    otherProductionCostTl: null,
  })
  assert(classPart.status === 'PARTIAL', 'D.10', 'Completeness classifier marks partial profile')

  // ─────────────────────────────────────────────────────────────
  // E. Channel Economics & Specific Channels
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- E. Channel Economics ---')

  // ZUULAB direct sale: 149 TL price, 32.50 TL production, 0% commission, 40 TL shipping, 2.8% + 0.50 TL payment (~4.67 TL)
  const feeZuulab = {
    id: 'test-z',
    channel: 'ZUULAB' as const,
    commissionPercent: 0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 40,
    estimatedPaymentFeePercent: 2.8,
    estimatedPaymentFeeFixedTl: 0.5,
    updatedAt: new Date().toISOString(),
  }

  const econZuulab = evaluateChannelEconomics({
    channel: 'ZUULAB',
    channelName: 'ZUULAB Direct',
    sellingPriceTl: 149,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: feeZuulab,
  })

  assert(econZuulab.commissionAmountTl === 0, 'E.1', 'ZUULAB direct channel has 0 TL commission')
  assert(econZuulab.shippingCostTl === 40, 'E.2', 'ZUULAB direct channel shipping cost is 40 TL')
  assert(econZuulab.paymentFeeTl === 4.67, 'E.3', 'ZUULAB direct channel payment fee is 4.67 TL (149 * 2.8% + 0.50)')
  // Contribution: 149 - 32.50 - 0 - 40 - 4.67 = 71.83 TL
  assert(econZuulab.estimatedContributionTl === 71.83, 'E.4', 'ZUULAB contribution is 71.83 TL (149 - 32.50 - 40 - 4.67)')
  assert(econZuulab.marginPercent === 48.21, 'E.5', 'ZUULAB margin is 48.21%')

  // Trendyol sale: 169 TL price, 32.50 TL production, 18% commission (30.42 TL), 45 TL shipping, 0 TL payment (included in TY)
  const feeTrendyol = {
    id: 'test-ty',
    channel: 'TRENDYOL' as const,
    commissionPercent: 18.0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 45,
    estimatedPaymentFeePercent: null,
    estimatedPaymentFeeFixedTl: 0,
    updatedAt: new Date().toISOString(),
  }

  const econTrendyol = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 169,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: feeTrendyol,
  })

  assert(econTrendyol.commissionAmountTl === 30.42, 'E.6', 'Trendyol 18% commission on 169 TL is 30.42 TL')
  assert(econTrendyol.shippingCostTl === 45, 'E.7', 'Trendyol shipping cost is 45 TL')
  assert(econTrendyol.paymentFeeTl === 0, 'E.8', 'Trendyol payment fee is 0 TL (included in marketplace fee)')
  // Contribution: 169 - 32.50 - 30.42 - 45 = 61.08 TL
  assert(econTrendyol.estimatedContributionTl === 61.08, 'E.9', 'Trendyol contribution is 61.08 TL (169 - 32.50 - 30.42 - 45)')
  assert(econTrendyol.marginPercent === 36.14, 'E.10', 'Trendyol margin is 36.14%')

  // Hepsiburada sale: 169 TL price, 32.50 TL production, 17% commission (28.73 TL), 45 TL shipping
  const feeHB = {
    id: 'test-hb',
    channel: 'HEPSIBURADA' as const,
    commissionPercent: 17.0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 45,
    estimatedPaymentFeePercent: null,
    estimatedPaymentFeeFixedTl: 0,
    updatedAt: new Date().toISOString(),
  }

  const econHB = evaluateChannelEconomics({
    channel: 'HEPSIBURADA',
    channelName: 'Hepsiburada',
    sellingPriceTl: 169,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: feeHB,
  })

  assert(econHB.commissionAmountTl === 28.73, 'E.11', 'Hepsiburada 17% commission on 169 TL is 28.73 TL')
  // Contribution: 169 - 32.50 - 28.73 - 45 = 62.77 TL
  assert(econHB.estimatedContributionTl === 62.77, 'E.12', 'Hepsiburada contribution is 62.77 TL')
  assert(econHB.marginPercent === 37.14, 'E.13', 'Hepsiburada margin is 37.14%')

  // ─────────────────────────────────────────────────────────────
  // F. Zero is NOT Unknown & Missing Value Handling
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- F. Zero vs Unknown Invariants ---')

  // Explicit 0 TL packaging vs null packaging
  const prodExplicitZeroPack = calculateProductionCost(24.5, 0, 2)
  assert(prodExplicitZeroPack.totalCostTl === 26.5, 'F.1', 'Explicit 0 TL packaging calculates properly')
  assert(prodExplicitZeroPack.status === 'COMPLETE', 'F.2', 'Explicit 0 TL is treated as COMPLETE (not missing)')

  const prodNullPack = calculateProductionCost(24.5, null, 2)
  assert(prodNullPack.status === 'PARTIAL', 'F.3', 'Null packaging is treated as PARTIAL missing')

  // Unknown commission on channel
  const econNoCommConfig = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 169,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: null,
  })
  assert(econNoCommConfig.commissionSource === 'UNAVAILABLE', 'F.4', 'When fee config missing, commissionSource is UNAVAILABLE')
  assert(econNoCommConfig.commissionAmountTl === null, 'F.5', 'When fee config missing, commissionAmountTl is null (never 0)')

  // Contribution calculation with missing production cost
  const contribMissingProd = calculateContribution(149, null, { shippingCostTl: 40 })
  assert(contribMissingProd.canCalculate === false, 'F.6', 'Cannot calculate contribution without production cost')
  assert(contribMissingProd.estimatedContributionTl === null, 'F.7', 'Contribution is null (not 0) when inputs missing')
  assert(contribMissingProd.marginPercent === null, 'F.8', 'Margin is null when contribution cannot be calculated')

  // Zero revenue calculation
  const contribZeroRev = calculateContribution(0, 32.5, { shippingCostTl: 40 })
  assert(contribZeroRev.marginPercent === null, 'F.9', 'Margin percent is null when selling price is 0 (avoids div by zero)')

  // ─────────────────────────────────────────────────────────────
  // G. Actual Order Data Priority
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- G. Actual Order Data Precedence ---')

  // When actual order data contains 25 TL commission and 38 TL shipping:
  const econWithActuals = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 169,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: feeTrendyol, // configured has 18% (30.42 TL) and 45 TL shipping
    actualOrderData: {
      actualCommissionTl: 25.0,
      actualShippingCostTl: 38.0,
      actualPaymentFeeTl: 1.5,
    },
  })

  assert(econWithActuals.commissionAmountTl === 25, 'G.1', 'Actual order commission (25 TL) strictly overrides configured (30.42 TL)')
  assert(econWithActuals.commissionSource === 'ACTUAL_ORDER_DATA', 'G.2', 'Commission source flagged as ACTUAL_ORDER_DATA')
  assert(econWithActuals.shippingCostTl === 38, 'G.3', 'Actual order shipping (38 TL) strictly overrides configured (45 TL)')
  assert(econWithActuals.shippingSource === 'ACTUAL_ORDER_DATA', 'G.4', 'Shipping source flagged as ACTUAL_ORDER_DATA')
  assert(econWithActuals.paymentFeeSource === 'ACTUAL_ORDER_DATA', 'G.5', 'Payment fee source flagged as ACTUAL_ORDER_DATA')
  // Contribution: 169 - 32.50 - 25 - 38 - 1.5 = 72.00 TL
  assert(econWithActuals.estimatedContributionTl === 72, 'G.6', 'Contribution calculated accurately with actual order overrides: 72 TL')

  // Fallback when actual is null: falls back to configured
  const econPartialActual = evaluateChannelEconomics({
    channel: 'TRENDYOL',
    channelName: 'Trendyol',
    sellingPriceTl: 169,
    productionCostTl: 32.5,
    costDataStatus: 'COMPLETE',
    feeConfig: feeTrendyol,
    actualOrderData: {
      actualCommissionTl: 22.0,
      actualShippingCostTl: null, // missing actual shipping
    },
  })
  assert(econPartialActual.commissionSource === 'ACTUAL_ORDER_DATA', 'G.7', 'Present actual commission used')
  assert(econPartialActual.shippingSource === 'CONFIGURED', 'G.8', 'Missing actual shipping safely fell back to CONFIGURED')
  assert(econPartialActual.shippingCostTl === 45, 'G.9', 'Configured 45 TL shipping used as fallback')

  // ─────────────────────────────────────────────────────────────
  // H. Historical Data & Material Profiles
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- H. Material Profile & Effective Date History ---')

  const materials = await getMaterials()
  assert(materials.length >= 4, 'H.1', 'Default raw materials loaded (PLA, PETG, TPU, ABS)')

  const plaMat = materials.find((m) => m.name === 'PLA')
  assert(plaMat !== undefined, 'H.2', 'PLA material profile exists')
  assert(plaMat?.pricePerKgTl === 700, 'H.3', 'PLA base price is 700 TL/kg')

  // Update material price from 700 to 750 with effective date
  const saveRes = await saveMaterial(
    {
      name: 'PLA',
      pricePerKgTl: 750,
      notes: 'Hammadde zammı sonrası yeni fiyat',
      effectiveFrom: '2026-09-29T18:00:00.000Z',
    },
    'admin@zuulab.com'
  )
  assert(saveRes.success, 'H.4', 'Material price updated successfully')
  assert(saveRes.material?.pricePerKgTl === 750, 'H.5', 'Material new price is 750 TL/kg')

  const plaHistory = await getMaterialPriceHistory('PLA')
  assert(plaHistory.length > 0, 'H.6', 'Material price history entry recorded')
  assert(plaHistory[plaHistory.length - 1].pricePerKgTl === 750, 'H.7', 'History entry captures new price 750 TL/kg')
  assert(plaHistory[plaHistory.length - 1].changedBy === 'admin@zuulab.com', 'H.8', 'Audit actor captured in history')

  // Revert back to 700 to maintain test idempotency
  await saveMaterial({ name: 'PLA', pricePerKgTl: 700 }, 'admin@zuulab.com')
  const revertedMat = (await getMaterials()).find((m) => m.name === 'PLA')
  assert(revertedMat?.pricePerKgTl === 700, 'H.9', 'Material price restored cleanly')

  // ─────────────────────────────────────────────────────────────
  // I. Product Economics Service Integration
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- I. Product Economics Service Operations ---')

  const prodId = 'prod-zk1' // Mini Dinozor Serisi
  const costProfile = await getProductCostProfile(prodId)
  assert(costProfile !== null, 'I.1', 'Product cost profile retrieved for prod-zk1')
  assert(costProfile?.productId === prodId, 'I.2', 'Cost profile productId matches')
  assert(costProfile?.sku === 'ZUU-KD-001', 'I.3', 'Cost profile SKU matches')
  assert(costProfile?.costStatus !== undefined, 'I.4', 'Cost status is defined')

  // Update product cost profile
  const updateRes = await updateProductCostProfile(
    prodId,
    {
      materialName: 'PLA',
      estimatedMaterialWeightGrams: 35,
      materialPricePerKgTl: 700,
      packagingCostTl: 6.0,
      otherProductionCostTl: 2.0,
    },
    'admin@zuulab.com'
  )
  assert(updateRes.success, 'I.5', 'Product cost profile updated successfully')
  assert(updateRes.profile?.estimatedMaterialWeightGrams === 35, 'I.6', 'Weight updated to 35g')
  assert(updateRes.profile?.estimatedMaterialCostTl === 24.5, 'I.7', 'Material cost calculated as 24.50 TL')
  assert(updateRes.profile?.estimatedProductionCostTl === 32.5, 'I.8', 'Total production cost calculated as 32.50 TL')
  assert(updateRes.profile?.costStatus === 'COMPLETE', 'I.9', 'Cost status transitioned to COMPLETE')

  // Full product economics detail
  const econDetail = await getProductEconomics(prodId)
  assert(econDetail !== null, 'I.10', 'Product economics detail retrieved')
  assert(econDetail?.channelEconomics.ZUULAB !== undefined, 'I.11', 'Channel economics contains ZUULAB')
  assert(econDetail?.channelEconomics.TRENDYOL !== undefined, 'I.12', 'Channel economics contains TRENDYOL')
  assert(econDetail?.channelEconomics.HEPSIBURADA !== undefined, 'I.13', 'Channel economics contains HEPSIBURADA')

  // Channel comparison
  const comparison = await getChannelComparison(prodId)
  assert(comparison !== null, 'I.14', 'Channel comparison retrieved')
  assert(comparison?.ZUULAB.canCalculateContribution === true, 'I.15', 'ZUULAB contribution can be calculated')
  assert(comparison?.TRENDYOL.canCalculateContribution === true, 'I.16', 'Trendyol contribution can be calculated')

  // Summary aggregation
  const summary = await getEconomicsSummary()
  assert(summary.totalProducts > 0, 'I.17', 'Summary reports total products')
  assert(summary.productsWithCompleteCost >= 1, 'I.18', 'Summary tracks complete cost products')
  assert(summary.totalGrossRevenueTl > 0, 'I.19', 'Summary calculates total sales revenue')
  assert(summary.totalEstimatedContributionTl !== null, 'I.20', 'Summary calculates total estimated contribution')

  // ─────────────────────────────────────────────────────────────
  // J. RBAC Permissions Enforcement
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- J. RBAC Permissions Enforcement ---')

  assert(!hasPermission('CUSTOMER', 'PRODUCT_ECONOMICS_VIEW'), 'J.1', 'CUSTOMER denied PRODUCT_ECONOMICS_VIEW')
  assert(!hasPermission('CUSTOMER', 'PRODUCT_ECONOMICS_MANAGE'), 'J.2', 'CUSTOMER denied PRODUCT_ECONOMICS_MANAGE')
  assert(!hasPermission('STAFF', 'PRODUCT_ECONOMICS_VIEW'), 'J.3', 'STAFF denied PRODUCT_ECONOMICS_VIEW')
  assert(!hasPermission('STAFF', 'PRODUCT_ECONOMICS_MANAGE'), 'J.4', 'STAFF denied PRODUCT_ECONOMICS_MANAGE')
  assert(hasPermission('ORDER_MANAGER', 'PRODUCT_ECONOMICS_VIEW'), 'J.5', 'ORDER_MANAGER allowed PRODUCT_ECONOMICS_VIEW')
  assert(!hasPermission('ORDER_MANAGER', 'PRODUCT_ECONOMICS_MANAGE'), 'J.6', 'ORDER_MANAGER denied PRODUCT_ECONOMICS_MANAGE')
  assert(hasPermission('ADMIN', 'PRODUCT_ECONOMICS_VIEW'), 'J.7', 'ADMIN allowed PRODUCT_ECONOMICS_VIEW')
  assert(hasPermission('ADMIN', 'PRODUCT_ECONOMICS_MANAGE'), 'J.8', 'ADMIN allowed PRODUCT_ECONOMICS_MANAGE')
  assert(hasPermission('SUPER_ADMIN', 'PRODUCT_ECONOMICS_VIEW'), 'J.9', 'SUPER_ADMIN allowed PRODUCT_ECONOMICS_VIEW')
  assert(hasPermission('SUPER_ADMIN', 'PRODUCT_ECONOMICS_MANAGE'), 'J.10', 'SUPER_ADMIN allowed PRODUCT_ECONOMICS_MANAGE')

  // ─────────────────────────────────────────────────────────────
  // K. Multi-Store Tenant Isolation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- K. Multi-Store Tenant Isolation ---')

  // Save fee config scoped to store-1
  await saveChannelFeeConfig(
    {
      channel: 'TRENDYOL',
      commissionPercent: 19.5,
      estimatedShippingCostTl: 48.0,
    },
    'admin@zuulab.com',
    'store-tenant-1'
  )

  // Save fee config scoped to store-2
  await saveChannelFeeConfig(
    {
      channel: 'TRENDYOL',
      commissionPercent: 15.0,
      estimatedShippingCostTl: 42.0,
    },
    'admin@zuulab.com',
    'store-tenant-2'
  )

  const store1Configs = await getChannelFeeConfigs('store-tenant-1')
  const store2Configs = await getChannelFeeConfigs('store-tenant-2')

  const s1Trendyol = store1Configs.find((c) => c.channel === 'TRENDYOL' && c.storeId === 'store-tenant-1')
  const s2Trendyol = store2Configs.find((c) => c.channel === 'TRENDYOL' && c.storeId === 'store-tenant-2')

  assert(s1Trendyol !== undefined && s1Trendyol.commissionPercent === 19.5, 'K.1', 'Store 1 isolated commission rate preserved (19.5%)')
  assert(s2Trendyol !== undefined && s2Trendyol.commissionPercent === 15.0, 'K.2', 'Store 2 isolated commission rate preserved (15.0%)')
  assert(s1Trendyol?.commissionPercent !== s2Trendyol?.commissionPercent, 'K.3', 'Tenant 1 fee config strictly isolated from Tenant 2')

  // ─────────────────────────────────────────────────────────────
  // L. Production Integration & Inventory Invariant
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- L. Production Integration & Inventory Invariant ---')

  const initialInv = await getInventoryStatus(prodId)
  const initialStock = initialInv.stock
  const initialReserved = initialInv.reserved
  const initialAvailable = initialInv.available

  // Check that querying product economics did NOT mutate inventory
  await getProductEconomics(prodId)
  await getEconomicsSummary()
  await getHistoricalSalesEconomics()

  const afterEconomicsInv = await getInventoryStatus(prodId)
  assert(afterEconomicsInv.stock === initialStock, 'L.1', 'INVARIANT: physical stock untouched by economics queries')
  assert(afterEconomicsInv.reserved === initialReserved, 'L.2', 'INVARIANT: reserved stock untouched by economics queries')
  assert(afterEconomicsInv.available === initialAvailable, 'L.3', 'INVARIANT: available stock untouched by economics queries')

  // Integration with actual production orders:
  const newOrder = await createProductionOrder({
    productId: prodId,
    quantity: 10,
    createdBy: 'operator-1',
  })
  assert(newOrder.success && newOrder.order !== undefined, 'L.4', 'Production order created')

  await startProductionOrder(newOrder.order!.id)
  await completeProductionOrder(newOrder.order!.id, { completedQuantity: 10, failedQuantity: 0 })
  await stockProductionOrder(newOrder.order!.id)

  const updatedEcon = await getProductEconomics(prodId)
  assert(updatedEcon?.actualProductionHistory !== undefined, 'L.5', 'Actual production history recognized in product economics')
  assert(updatedEcon?.actualProductionHistory?.orderCount! >= 1, 'L.6', 'Stocked production batch count tracked')

  const finalInv = await getInventoryStatus(prodId)
  assert(finalInv.stock === initialStock + 10, 'L.7', 'Stock authoritatively incremented by ProductionService (+10)')

  // ─────────────────────────────────────────────────────────────
  // M. Verification Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n===============================================================')
  console.log(`  PHASE 24 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
