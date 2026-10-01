import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import { MOCK_PRODUCTS, type MockProduct } from '@/lib/mock-data'
import { getProductionOrders, type ProductionOrder } from './production.service'

// ─────────────────────────────────────────────────────────────
// ENUMS & TYPES
// ─────────────────────────────────────────────────────────────

export type CostDataStatus = 'COMPLETE' | 'PARTIAL' | 'MISSING'

export type FeeSource = 'ACTUAL_ORDER_DATA' | 'CONFIGURED' | 'MANUAL' | 'UNAVAILABLE'

export type CostDataSource = 'ACTUAL' | 'ESTIMATED' | 'MANUAL' | 'CONFIGURED' | 'UNAVAILABLE'

export type SalesChannel = 'ZUULAB' | 'TRENDYOL' | 'HEPSIBURADA'

export interface MaterialProfile {
  id: string
  storeId?: string | null
  name: string
  pricePerKgTl: number
  currency: string
  active: boolean
  effectiveFrom: string
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface MaterialPriceHistoryEntry {
  materialName: string
  pricePerKgTl: number
  effectiveFrom: string
  changedBy?: string
  notes?: string
}

export interface ChannelFeeConfig {
  id: string
  storeId?: string | null
  channel: SalesChannel
  commissionPercent: number | null
  commissionFixedTl: number | null
  estimatedShippingCostTl: number | null
  estimatedPaymentFeePercent: number | null
  estimatedPaymentFeeFixedTl: number | null
  notes?: string | null
  updatedAt: string
}

export interface ProductCostProfile {
  productId: string
  productName: string
  sku: string
  materialId?: string | null
  materialName?: string | null
  estimatedMaterialWeightGrams: number | null
  materialPricePerKgTl: number | null
  packagingCostTl: number | null
  otherProductionCostTl: number | null
  costStatus: CostDataStatus
  missingFields: string[]
  // Calculated outputs
  estimatedMaterialCostTl: number | null
  estimatedProductionCostTl: number | null
  costSource: CostDataSource
  isEstimate: boolean
  lastCalculatedAt: string
}

export interface ChannelEconomics {
  channel: SalesChannel
  channelName: string
  sellingPriceTl: number | null
  sellingPriceSource: CostDataSource
  estimatedProductionCostTl: number | null
  productionCostSource: CostDataSource
  // Deductions
  commissionPercent: number | null
  commissionAmountTl: number | null
  commissionSource: FeeSource
  shippingCostTl: number | null
  shippingSource: FeeSource
  paymentFeeTl: number | null
  paymentFeeSource: FeeSource
  otherFeesTl: number | null
  totalDeductionsTl: number | null
  // Contributions & Margins
  estimatedContributionTl: number | null // Tahmini Net Katkı
  marginPercent: number | null
  canCalculateContribution: boolean
  unavailabilityReasons: string[]
  isEstimate: boolean
}

export interface ProductEconomicsDetail {
  product: {
    id: string
    name: string
    sku: string
    price: number
    stock: number
  }
  costProfile: ProductCostProfile
  channelEconomics: Record<SalesChannel, ChannelEconomics>
  actualProductionHistory?: {
    orderCount: number
    totalProduced: number
    lastProducedAt: string | null
    averageActualCostTl: number | null
  }
}

export interface HistoricalSalesItemEconomics {
  productId: string
  productName: string
  sku: string
  channel: SalesChannel
  unitsSold: number
  grossRevenueTl: number
  estimatedProductionCostTl: number | null
  productionCostSource: CostDataSource
  commissionDeductionTl: number | null
  commissionSource: FeeSource
  shippingDeductionTl: number | null
  shippingSource: FeeSource
  paymentFeeDeductionTl: number | null
  paymentFeeSource: FeeSource
  totalKnownDeductionsTl: number
  estimatedContributionTl: number | null
  marginPercent: number | null
  dataCompleteness: CostDataStatus
  isEstimate: boolean
}

export interface EconomicsSummary {
  period: string
  channel: string
  totalProducts: number
  productsWithCompleteCost: number
  productsWithPartialCost: number
  productsWithMissingCost: number
  totalUnitsSold: number
  totalGrossRevenueTl: number
  totalEstimatedProductionCostTl: number | null
  totalEstimatedContributionTl: number | null
  averageEstimatedContributionTl: number | null
  overallMarginPercent: number | null
  isEstimate: boolean
  hasSufficientData: boolean
  unavailabilityNotice?: string
}

export interface UpdateCostProfileInput {
  materialName?: string | null
  estimatedMaterialWeightGrams?: number | null
  materialPricePerKgTl?: number | null
  packagingCostTl?: number | null
  otherProductionCostTl?: number | null
  notes?: string
}

// ─────────────────────────────────────────────────────────────
// DETERMINISTIC MONEY & ARITHMETIC UTILITIES
// ─────────────────────────────────────────────────────────────

/**
 * Deterministically rounds a number to 2 decimal places using minor currency units (kuruş).
 * Avoids JavaScript floating point rounding artifacts like 0.1 + 0.2 = 0.30000000000000004.
 */
export function roundMoney(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * Validates inputs for non-negative values and permissible ranges.
 */
export function validateCostInputs(input: {
  weightGrams?: number | null
  pricePerKgTl?: number | null
  packagingCostTl?: number | null
  otherProductionCostTl?: number | null
  commissionPercent?: number | null
  sellingPrice?: number | null
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (input.weightGrams !== undefined && input.weightGrams !== null) {
    if (input.weightGrams < 0) {
      errors.push('Malzeme ağırlığı (gramaj) negatif olamaz.')
    }
  }

  if (input.pricePerKgTl !== undefined && input.pricePerKgTl !== null) {
    if (input.pricePerKgTl < 0) {
      errors.push('Kilogram malzeme fiyatı negatif olamaz.')
    }
  }

  if (input.packagingCostTl !== undefined && input.packagingCostTl !== null) {
    if (input.packagingCostTl < 0) {
      errors.push('Paketleme maliyeti negatif olamaz.')
    }
  }

  if (input.otherProductionCostTl !== undefined && input.otherProductionCostTl !== null) {
    if (input.otherProductionCostTl < 0) {
      errors.push('Diğer üretim gideri negatif olamaz.')
    }
  }

  if (input.commissionPercent !== undefined && input.commissionPercent !== null) {
    if (input.commissionPercent < 0 || input.commissionPercent > 100) {
      errors.push('Komisyon yüzdesi 0 ile 100 arasında olmalıdır.')
    }
  }

  if (input.sellingPrice !== undefined && input.sellingPrice !== null) {
    if (input.sellingPrice < 0) {
      errors.push('Satış fiyatı negatif olamaz.')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ─────────────────────────────────────────────────────────────
// PURE CALCULATION FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Pure calculation: 3D printing material cost based on grams and price per kg.
 * Formula: (weightGrams / 1000) * pricePerKgTl
 * Returns null if either input is null/undefined (zero is NOT unknown).
 */
export function calculateMaterialCost(
  weightGrams: number | null | undefined,
  pricePerKgTl: number | null | undefined
): number | null {
  if (weightGrams === null || weightGrams === undefined || pricePerKgTl === null || pricePerKgTl === undefined) {
    return null
  }
  if (weightGrams < 0 || pricePerKgTl < 0) {
    throw new Error('Malzeme ağırlığı ve fiyatı negatif olamaz.')
  }
  // Decimal math: (weightGrams * pricePerKgTl) / 1000
  const totalKurus = Math.round(((weightGrams * pricePerKgTl) / 1000) * 100)
  return totalKurus / 100
}

/**
 * Pure calculation: Classifies completeness of product cost data.
 */
export function classifyCostDataCompleteness(fields: {
  weightGrams: number | null | undefined
  pricePerKgTl: number | null | undefined
  packagingCostTl: number | null | undefined
  otherProductionCostTl: number | null | undefined
}): { status: CostDataStatus; missingFields: string[] } {
  const missingFields: string[] = []

  const hasMaterial = fields.weightGrams !== null && fields.weightGrams !== undefined &&
                      fields.pricePerKgTl !== null && fields.pricePerKgTl !== undefined
  if (!hasMaterial) {
    if (fields.weightGrams === null || fields.weightGrams === undefined) missingFields.push('Malzeme Ağırlığı (g)')
    if (fields.pricePerKgTl === null || fields.pricePerKgTl === undefined) missingFields.push('Malzeme Birim Fiyatı (TL/kg)')
  }

  if (fields.packagingCostTl === null || fields.packagingCostTl === undefined) {
    missingFields.push('Paketleme Maliyeti')
  }

  if (fields.otherProductionCostTl === null || fields.otherProductionCostTl === undefined) {
    missingFields.push('Diğer Üretim Gideri')
  }

  if (missingFields.length === 0) {
    return { status: 'COMPLETE', missingFields: [] }
  }

  // If all three categories are missing:
  const allMissing = !hasMaterial &&
                     (fields.packagingCostTl === null || fields.packagingCostTl === undefined) &&
                     (fields.otherProductionCostTl === null || fields.otherProductionCostTl === undefined)

  if (allMissing) {
    return { status: 'MISSING', missingFields }
  }

  return { status: 'PARTIAL', missingFields }
}

/**
 * Pure calculation: Total estimated production cost.
 * Formula: materialCost + packagingCost + otherProductionCost
 */
export function calculateProductionCost(
  materialCostTl: number | null | undefined,
  packagingCostTl: number | null | undefined,
  otherCostTl: number | null | undefined
): {
  totalCostTl: number | null
  status: CostDataStatus
  missingFields: string[]
} {
  const missingFields: string[] = []
  if (materialCostTl === null || materialCostTl === undefined) missingFields.push('Malzeme Maliyeti')
  if (packagingCostTl === null || packagingCostTl === undefined) missingFields.push('Paketleme Maliyeti')
  if (otherCostTl === null || otherCostTl === undefined) missingFields.push('Diğer Giderler')

  let status: CostDataStatus = 'COMPLETE'
  if (missingFields.length === 3) {
    status = 'MISSING'
    return { totalCostTl: null, status, missingFields }
  } else if (missingFields.length > 0) {
    status = 'PARTIAL'
  }

  // Calculate sum of known components
  const mat = materialCostTl ?? 0
  const pack = packagingCostTl ?? 0
  const oth = otherCostTl ?? 0
  const totalCostTl = roundMoney(mat + pack + oth)

  return { totalCostTl, status, missingFields }
}

/**
 * Pure calculation: Channel net contribution and margin percentage.
 * Formula: grossRevenue - productionCost - channelCommission - shippingCost - paymentFee - otherCosts
 */
export function calculateContribution(
  sellingPriceTl: number | null | undefined,
  productionCostTl: number | null | undefined,
  deductions: {
    commissionTl?: number | null
    shippingCostTl?: number | null
    paymentFeeTl?: number | null
    otherFeesTl?: number | null
  }
): {
  estimatedContributionTl: number | null
  marginPercent: number | null
  canCalculate: boolean
  unavailabilityReasons: string[]
} {
  const reasons: string[] = []

  if (sellingPriceTl === null || sellingPriceTl === undefined) {
    reasons.push('Satış fiyatı eksik.')
  }
  if (productionCostTl === null || productionCostTl === undefined) {
    reasons.push('Üretim maliyeti hesaplanamadı.')
  }
  if (deductions.commissionTl === null) {
    reasons.push('Komisyon tutarı bilinmiyor (UNAVAILABLE).')
  }
  if (deductions.shippingCostTl === null) {
    reasons.push('Kargo ücreti bilinmiyor (UNAVAILABLE).')
  }
  if (deductions.paymentFeeTl === null) {
    reasons.push('Ödeme işlem ücreti bilinmiyor (UNAVAILABLE).')
  }

  if (
    sellingPriceTl === null ||
    sellingPriceTl === undefined ||
    productionCostTl === null ||
    productionCostTl === undefined ||
    deductions.commissionTl === null ||
    deductions.shippingCostTl === null ||
    deductions.paymentFeeTl === null
  ) {
    return {
      estimatedContributionTl: null,
      marginPercent: null,
      canCalculate: false,
      unavailabilityReasons: reasons,
    }
  }

  const commission = deductions.commissionTl ?? 0
  const shipping = deductions.shippingCostTl ?? 0
  const payment = deductions.paymentFeeTl ?? 0
  const other = deductions.otherFeesTl ?? 0

  const totalDeductions = roundMoney(commission + shipping + payment + other)
  const contribution = roundMoney(sellingPriceTl - productionCostTl - totalDeductions)

  let marginPercent: number | null = null
  if (sellingPriceTl > 0) {
    marginPercent = roundMoney((contribution / sellingPriceTl) * 100)
  }

  return {
    estimatedContributionTl: contribution,
    marginPercent,
    canCalculate: true,
    unavailabilityReasons: [],
  }
}

/**
 * Pure calculation: Evaluates channel economics factoring in fee sources and actual vs configured values.
 */
export function evaluateChannelEconomics(params: {
  channel: SalesChannel
  channelName: string
  sellingPriceTl: number | null
  productionCostTl: number | null
  costDataStatus: CostDataStatus
  // Fee configuration
  feeConfig?: ChannelFeeConfig | null
  // Actual order override data if available
  actualOrderData?: {
    actualCommissionTl?: number | null
    actualShippingCostTl?: number | null
    actualPaymentFeeTl?: number | null
  } | null
}): ChannelEconomics {
  const { channel, channelName, sellingPriceTl, productionCostTl, costDataStatus, feeConfig, actualOrderData } = params

  let commissionAmountTl: number | null = null
  let commissionPercent: number | null = null
  let commissionSource: FeeSource = 'UNAVAILABLE'

  let shippingCostTl: number | null = null
  let shippingSource: FeeSource = 'UNAVAILABLE'

  let paymentFeeTl: number | null = null
  let paymentFeeSource: FeeSource = 'UNAVAILABLE'

  const reasons: string[] = []

  // 1. Commission Resolution (Actual > Configured > Unavailable)
  if (actualOrderData?.actualCommissionTl !== undefined && actualOrderData?.actualCommissionTl !== null) {
    commissionAmountTl = roundMoney(actualOrderData.actualCommissionTl)
    commissionSource = 'ACTUAL_ORDER_DATA'
  } else if (feeConfig?.commissionPercent !== null && feeConfig?.commissionPercent !== undefined) {
    commissionPercent = feeConfig.commissionPercent
    if (sellingPriceTl !== null) {
      const pctAmount = (sellingPriceTl * feeConfig.commissionPercent) / 100
      const fixedAmount = feeConfig.commissionFixedTl || 0
      commissionAmountTl = roundMoney(pctAmount + fixedAmount)
      commissionSource = 'CONFIGURED'
    } else {
      reasons.push('Fiyat bilinmediği için komisyon tutarı hesaplanamadı.')
    }
  } else if (feeConfig?.commissionFixedTl !== null && feeConfig?.commissionFixedTl !== undefined) {
    commissionAmountTl = roundMoney(feeConfig.commissionFixedTl)
    commissionSource = 'CONFIGURED'
  } else if (channel === 'ZUULAB') {
    // Direct store has 0% marketplace commission
    commissionPercent = 0
    commissionAmountTl = 0
    commissionSource = 'CONFIGURED'
  } else {
    commissionSource = 'UNAVAILABLE'
    reasons.push(`${channelName} için komisyon oranı yapılandırılmamış.`)
  }

  // 2. Shipping Resolution (Actual > Configured > Unavailable)
  if (actualOrderData?.actualShippingCostTl !== undefined && actualOrderData?.actualShippingCostTl !== null) {
    shippingCostTl = roundMoney(actualOrderData.actualShippingCostTl)
    shippingSource = 'ACTUAL_ORDER_DATA'
  } else if (feeConfig?.estimatedShippingCostTl !== null && feeConfig?.estimatedShippingCostTl !== undefined) {
    shippingCostTl = roundMoney(feeConfig.estimatedShippingCostTl)
    shippingSource = 'CONFIGURED'
  } else {
    shippingSource = 'UNAVAILABLE'
    reasons.push(`${channelName} için tahmini kargo ücreti tanımlanmamış.`)
  }

  // 3. Payment Fee Resolution (Actual > Configured > Unavailable)
  if (actualOrderData?.actualPaymentFeeTl !== undefined && actualOrderData?.actualPaymentFeeTl !== null) {
    paymentFeeTl = roundMoney(actualOrderData.actualPaymentFeeTl)
    paymentFeeSource = 'ACTUAL_ORDER_DATA'
  } else if (feeConfig?.estimatedPaymentFeePercent !== null && feeConfig?.estimatedPaymentFeePercent !== undefined) {
    if (sellingPriceTl !== null) {
      const pctAmount = (sellingPriceTl * feeConfig.estimatedPaymentFeePercent) / 100
      const fixedAmount = feeConfig.estimatedPaymentFeeFixedTl || 0
      paymentFeeTl = roundMoney(pctAmount + fixedAmount)
      paymentFeeSource = 'CONFIGURED'
    }
  } else if (feeConfig?.estimatedPaymentFeeFixedTl !== null && feeConfig?.estimatedPaymentFeeFixedTl !== undefined) {
    paymentFeeTl = roundMoney(feeConfig.estimatedPaymentFeeFixedTl)
    paymentFeeSource = 'CONFIGURED'
  } else if (channel === 'TRENDYOL' || channel === 'HEPSIBURADA') {
    // Marketplace payment processing is included in their commission
    paymentFeeTl = 0
    paymentFeeSource = 'CONFIGURED'
  } else {
    paymentFeeSource = 'UNAVAILABLE'
  }

  // Calculate total deductions
  let totalDeductionsTl: number | null = null
  if (commissionAmountTl === null || shippingCostTl === null || paymentFeeTl === null) {
    totalDeductionsTl = null
  } else {
    totalDeductionsTl = roundMoney(commissionAmountTl + shippingCostTl + paymentFeeTl)
  }

  // Contribution
  const contribCalc = calculateContribution(sellingPriceTl, productionCostTl, {
    commissionTl: commissionAmountTl,
    shippingCostTl,
    paymentFeeTl,
  })

  const isEstimate =
    commissionSource !== 'ACTUAL_ORDER_DATA' ||
    shippingSource !== 'ACTUAL_ORDER_DATA' ||
    paymentFeeSource !== 'ACTUAL_ORDER_DATA' ||
    costDataStatus !== 'COMPLETE'

  return {
    channel,
    channelName,
    sellingPriceTl,
    sellingPriceSource: sellingPriceTl !== null ? 'CONFIGURED' : 'UNAVAILABLE',
    estimatedProductionCostTl: productionCostTl,
    productionCostSource: productionCostTl !== null ? (costDataStatus === 'COMPLETE' ? 'ESTIMATED' : 'MANUAL') : 'UNAVAILABLE',
    commissionPercent,
    commissionAmountTl,
    commissionSource,
    shippingCostTl,
    shippingSource,
    paymentFeeTl,
    paymentFeeSource,
    otherFeesTl: 0,
    totalDeductionsTl,
    estimatedContributionTl: contribCalc.estimatedContributionTl,
    marginPercent: contribCalc.marginPercent,
    canCalculateContribution: contribCalc.canCalculate,
    unavailabilityReasons: [...reasons, ...contribCalc.unavailabilityReasons],
    isEstimate,
  }
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STORAGE & FALLBACKS (WITH MULTI-STORE TENANT ISOLATION)
// ─────────────────────────────────────────────────────────────

const inMemoryMaterials: Map<string, MaterialProfile> = new Map()
const inMemoryPriceHistory: MaterialPriceHistoryEntry[] = []
const inMemoryFeeConfigs: Map<string, ChannelFeeConfig> = new Map()
const inMemoryProductCostOverrides: Map<string, Partial<ProductCostProfile>> = new Map()

// Default seeded raw materials for 3D printing
const DEFAULT_MATERIALS: MaterialProfile[] = [
  {
    id: 'mat-pla',
    name: 'PLA',
    pricePerKgTl: 700.0,
    currency: 'TRY',
    active: true,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    notes: 'Standart PLA filament (eSun / Creality / Porima)',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-petg',
    name: 'PETG',
    pricePerKgTl: 750.0,
    currency: 'TRY',
    active: true,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    notes: 'Dayanıklı PETG filament',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-tpu',
    name: 'TPU',
    pricePerKgTl: 950.0,
    currency: 'TRY',
    active: true,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    notes: 'Esnek filament',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'mat-abs',
    name: 'ABS',
    pricePerKgTl: 650.0,
    currency: 'TRY',
    active: true,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    notes: 'Teknik parçalar için ABS',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
]

// Default seeded channel fee profiles
const DEFAULT_FEE_CONFIGS: ChannelFeeConfig[] = [
  {
    id: 'fee-zuulab',
    channel: 'ZUULAB',
    commissionPercent: 0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 40.0,
    estimatedPaymentFeePercent: 2.8,
    estimatedPaymentFeeFixedTl: 0.5,
    notes: 'Kendi mağazamız: Komisyon yok, kargo ve sanal pos maliyeti',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'fee-trendyol',
    channel: 'TRENDYOL',
    commissionPercent: 18.0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 45.0,
    estimatedPaymentFeePercent: null,
    estimatedPaymentFeeFixedTl: 0,
    notes: 'Trendyol standart kategori komisyonu ve anlaşmalı kargo baremi',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'fee-hepsiburada',
    channel: 'HEPSIBURADA',
    commissionPercent: 17.0,
    commissionFixedTl: 0,
    estimatedShippingCostTl: 45.0,
    estimatedPaymentFeePercent: null,
    estimatedPaymentFeeFixedTl: 0,
    notes: 'Hepsiburada standart kategori komisyonu ve anlaşmalı kargo baremi',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
]

// Initialize defaults into memory
for (const m of DEFAULT_MATERIALS) {
  inMemoryMaterials.set(m.id, m)
}
for (const f of DEFAULT_FEE_CONFIGS) {
  inMemoryFeeConfigs.set(f.channel, f)
}

// ─────────────────────────────────────────────────────────────
// MATERIAL PROFILES & HISTORY
// ─────────────────────────────────────────────────────────────

export async function getMaterials(storeId?: string | null): Promise<MaterialProfile[]> {
  if (isDatabaseConfigured) {
    try {
      const records = await (db.orm.public as any).MaterialProfile.where({
        active: true,
        ...(storeId ? { storeId } : {}),
      }).findMany()
      if (records && records.length > 0) {
        return records.map((r: any) => ({
          id: r.id,
          storeId: r.storeId,
          name: r.name,
          pricePerKgTl: Number(r.pricePerKgTl),
          currency: r.currency,
          active: r.active,
          effectiveFrom: r.effectiveFrom ? r.effectiveFrom.toISOString() : new Date().toISOString(),
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }))
      }
    } catch {
      // fallback to in-memory
    }
  }

  return Array.from(inMemoryMaterials.values()).filter((m) => {
    if (!m.active) return false
    if (storeId && m.storeId && m.storeId !== storeId) return false
    return true
  })
}

export async function getMaterialByName(name: string, storeId?: string | null): Promise<MaterialProfile | null> {
  const materials = await getMaterials(storeId)
  return materials.find((m) => m.name.toLowerCase() === name.toLowerCase()) || null
}

export async function saveMaterial(
  input: {
    name: string
    pricePerKgTl: number
    currency?: string
    notes?: string
    effectiveFrom?: string
  },
  userId?: string,
  storeId?: string | null
): Promise<{ success: boolean; material?: MaterialProfile; error?: string }> {
  if (!input.name || input.name.trim() === '') {
    return { success: false, error: 'Malzeme adı zorunludur.' }
  }
  if (input.pricePerKgTl < 0) {
    return { success: false, error: 'Kilogram fiyatı negatif olamaz.' }
  }

  const existing = await getMaterialByName(input.name, storeId)
  const now = new Date().toISOString()
  const effectiveDate = input.effectiveFrom || now

  // Record price history if price changed
  if (existing && existing.pricePerKgTl !== input.pricePerKgTl) {
    inMemoryPriceHistory.push({
      materialName: existing.name,
      pricePerKgTl: input.pricePerKgTl,
      effectiveFrom: effectiveDate,
      changedBy: userId || 'admin',
      notes: `Fiyat güncellemesi: ${existing.pricePerKgTl} TL -> ${input.pricePerKgTl} TL`,
    })

    await logAuditEvent({
      action: 'MATERIAL_PRICE_UPDATED',
      entity: 'MaterialProfile',
      entityId: existing.id,
      userId: userId || null,
      metadata: {
        materialName: existing.name,
        oldPricePerKg: existing.pricePerKgTl,
        newPricePerKg: input.pricePerKgTl,
        effectiveFrom: effectiveDate,
      },
    })
  }

  const id = existing ? existing.id : 'mat-' + input.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const updated: MaterialProfile = {
    id,
    storeId: storeId || null,
    name: input.name.trim().toUpperCase(),
    pricePerKgTl: roundMoney(input.pricePerKgTl),
    currency: input.currency || 'TRY',
    active: true,
    effectiveFrom: effectiveDate,
    notes: input.notes || null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  }

  inMemoryMaterials.set(id, updated)

  if (isDatabaseConfigured) {
    try {
      if (existing) {
        await (db.orm.public as any).MaterialProfile.where({ id: existing.id }).update({
          pricePerKgTl: updated.pricePerKgTl,
          effectiveFrom: new Date(effectiveDate),
          notes: updated.notes,
          updatedAt: new Date(now),
        })
      } else {
        await (db.orm.public as any).MaterialProfile.create({
          id: updated.id,
          storeId: updated.storeId,
          name: updated.name,
          pricePerKgTl: updated.pricePerKgTl,
          currency: updated.currency,
          active: true,
          effectiveFrom: new Date(effectiveDate),
          notes: updated.notes,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      }
    } catch (err) {
      console.warn('[product-economics.service] DB saveMaterial failed:', err)
    }
  }

  return { success: true, material: updated }
}

export async function getMaterialPriceHistory(materialName: string): Promise<MaterialPriceHistoryEntry[]> {
  return inMemoryPriceHistory.filter(
    (h) => h.materialName.toUpperCase() === materialName.toUpperCase()
  )
}

// ─────────────────────────────────────────────────────────────
// CHANNEL FEE CONFIGURATION
// ─────────────────────────────────────────────────────────────

export async function getChannelFeeConfigs(storeId?: string | null): Promise<ChannelFeeConfig[]> {
  if (isDatabaseConfigured) {
    try {
      const records = await (db.orm.public as any).ChannelFeeConfig.where(
        storeId ? { storeId } : {}
      ).findMany()
      if (records && records.length > 0) {
        return records.map((r: any) => ({
          id: r.id,
          storeId: r.storeId,
          channel: r.channel as SalesChannel,
          commissionPercent: r.commissionPercent ? Number(r.commissionPercent) : null,
          commissionFixedTl: r.commissionFixedTl ? Number(r.commissionFixedTl) : null,
          estimatedShippingCostTl: r.estimatedShippingCostTl ? Number(r.estimatedShippingCostTl) : null,
          estimatedPaymentFeePercent: r.estimatedPaymentFeePercent ? Number(r.estimatedPaymentFeePercent) : null,
          estimatedPaymentFeeFixedTl: r.estimatedPaymentFeeFixedTl ? Number(r.estimatedPaymentFeeFixedTl) : null,
          notes: r.notes,
          updatedAt: r.updatedAt.toISOString(),
        }))
      }
    } catch {
      // fallback
    }
  }

  return Array.from(inMemoryFeeConfigs.values()).filter((c) => {
    if (storeId) {
      return c.storeId === storeId
    }
    return !c.storeId
  })
}

export async function saveChannelFeeConfig(
  input: {
    channel: SalesChannel
    commissionPercent?: number | null
    commissionFixedTl?: number | null
    estimatedShippingCostTl?: number | null
    estimatedPaymentFeePercent?: number | null
    estimatedPaymentFeeFixedTl?: number | null
    notes?: string
  },
  userId?: string,
  storeId?: string | null
): Promise<{ success: boolean; config?: ChannelFeeConfig; error?: string }> {
  const valCheck = validateCostInputs({
    commissionPercent: input.commissionPercent,
  })
  if (!valCheck.valid) {
    return { success: false, error: valCheck.errors.join(' ') }
  }

  const feeKey = storeId ? `${storeId}:${input.channel}` : input.channel
  const existing = inMemoryFeeConfigs.get(feeKey)
  const now = new Date().toISOString()

  const updated: ChannelFeeConfig = {
    id: existing ? existing.id : 'fee-' + (storeId ? storeId + '-' : '') + input.channel.toLowerCase(),
    storeId: storeId || null,
    channel: input.channel,
    commissionPercent: input.commissionPercent !== undefined ? input.commissionPercent : existing?.commissionPercent ?? null,
    commissionFixedTl: input.commissionFixedTl !== undefined ? input.commissionFixedTl : existing?.commissionFixedTl ?? null,
    estimatedShippingCostTl: input.estimatedShippingCostTl !== undefined ? input.estimatedShippingCostTl : existing?.estimatedShippingCostTl ?? null,
    estimatedPaymentFeePercent: input.estimatedPaymentFeePercent !== undefined ? input.estimatedPaymentFeePercent : existing?.estimatedPaymentFeePercent ?? null,
    estimatedPaymentFeeFixedTl: input.estimatedPaymentFeeFixedTl !== undefined ? input.estimatedPaymentFeeFixedTl : existing?.estimatedPaymentFeeFixedTl ?? null,
    notes: input.notes !== undefined ? input.notes : existing?.notes ?? null,
    updatedAt: now,
  }

  inMemoryFeeConfigs.set(feeKey, updated)

  await logAuditEvent({
    action: 'CHANNEL_FEE_CONFIG_UPDATED',
    entity: 'ChannelFeeConfig',
    entityId: updated.id,
    userId: userId || null,
    metadata: {
      channel: input.channel,
      commissionPercent: updated.commissionPercent,
      estimatedShippingCostTl: updated.estimatedShippingCostTl,
      storeId,
    },
  })

  return { success: true, config: updated }
}

// ─────────────────────────────────────────────────────────────
// PRODUCT COST PROFILE & RECONCILIATION
// ─────────────────────────────────────────────────────────────

export async function getProductCostProfile(
  productId: string,
  storeId?: string | null
): Promise<ProductCostProfile | null> {
  // 1. Look up product
  let product: any = null
  if (isDatabaseConfigured) {
    try {
      product = await (db.orm.public as any).Product.where({ id: productId }).first()
    } catch {}
  }
  if (!product) {
    product = MOCK_PRODUCTS.find((p) => p.id === productId || p.sku === productId)
  }
  if (!product) return null

  // 2. Read cost inputs (allowing in-memory overrides)
  const override = inMemoryProductCostOverrides.get(product.id)

  const weightGrams = override?.estimatedMaterialWeightGrams !== undefined
    ? override.estimatedMaterialWeightGrams
    : (product.estimatedMaterialWeightGrams ?? (product.weight ? Number(product.weight) : null))

  let pricePerKg = override?.materialPricePerKgTl !== undefined
    ? override.materialPricePerKgTl
    : (product.materialCostPerKgTl ? Number(product.materialCostPerKgTl) : null)

  const packagingCost = override?.packagingCostTl !== undefined
    ? override.packagingCostTl
    : (product.packagingCostTl !== undefined && product.packagingCostTl !== null ? Number(product.packagingCostTl) : null)

  const otherCost = override?.otherProductionCostTl !== undefined
    ? override.otherProductionCostTl
    : (product.otherProductionCostTl !== undefined && product.otherProductionCostTl !== null ? Number(product.otherProductionCostTl) : null)

  // Material name resolution
  let materialName = override?.materialName || product.material || 'PLA'
  if (pricePerKg === null && materialName) {
    const matProfile = await getMaterialByName(materialName, storeId)
    if (matProfile) {
      pricePerKg = matProfile.pricePerKgTl
    }
  }

  // 3. Classify completeness & Calculate
  const completeness = classifyCostDataCompleteness({
    weightGrams,
    pricePerKgTl: pricePerKg,
    packagingCostTl: packagingCost,
    otherProductionCostTl: otherCost,
  })

  const estimatedMaterialCost = calculateMaterialCost(weightGrams, pricePerKg)
  const prodCostCalc = calculateProductionCost(estimatedMaterialCost, packagingCost, otherCost)

  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    materialName,
    estimatedMaterialWeightGrams: weightGrams,
    materialPricePerKgTl: pricePerKg,
    packagingCostTl: packagingCost,
    otherProductionCostTl: otherCost,
    costStatus: completeness.status,
    missingFields: completeness.missingFields,
    estimatedMaterialCostTl: estimatedMaterialCost,
    estimatedProductionCostTl: prodCostCalc.totalCostTl,
    costSource: completeness.status === 'COMPLETE' ? 'ESTIMATED' : 'MANUAL',
    isEstimate: true,
    lastCalculatedAt: new Date().toISOString(),
  }
}

export async function updateProductCostProfile(
  productId: string,
  input: UpdateCostProfileInput,
  userId?: string,
  storeId?: string | null
): Promise<{ success: boolean; profile?: ProductCostProfile; error?: string }> {
  // Validation
  const valCheck = validateCostInputs({
    weightGrams: input.estimatedMaterialWeightGrams,
    pricePerKgTl: input.materialPricePerKgTl,
    packagingCostTl: input.packagingCostTl,
    otherProductionCostTl: input.otherProductionCostTl,
  })
  if (!valCheck.valid) {
    return { success: false, error: valCheck.errors.join(' ') }
  }

  const existingProfile = await getProductCostProfile(productId, storeId)
  if (!existingProfile) {
    return { success: false, error: `Ürün bulunamadı: ${productId}` }
  }

  // Persist override in memory
  const newOverride: Partial<ProductCostProfile> = {
    estimatedMaterialWeightGrams: input.estimatedMaterialWeightGrams !== undefined ? input.estimatedMaterialWeightGrams : existingProfile.estimatedMaterialWeightGrams,
    materialName: input.materialName !== undefined ? input.materialName : existingProfile.materialName,
    materialPricePerKgTl: input.materialPricePerKgTl !== undefined ? input.materialPricePerKgTl : existingProfile.materialPricePerKgTl,
    packagingCostTl: input.packagingCostTl !== undefined ? input.packagingCostTl : existingProfile.packagingCostTl,
    otherProductionCostTl: input.otherProductionCostTl !== undefined ? input.otherProductionCostTl : existingProfile.otherProductionCostTl,
  }
  inMemoryProductCostOverrides.set(productId, newOverride)

  // Also update DB if configured
  if (isDatabaseConfigured) {
    try {
      await (db.orm.public as any).Product.where({ id: productId }).update({
        estimatedMaterialWeightGrams: newOverride.estimatedMaterialWeightGrams,
        materialCostPerKgTl: newOverride.materialPricePerKgTl,
        packagingCostTl: newOverride.packagingCostTl,
        otherProductionCostTl: newOverride.otherProductionCostTl,
        material: newOverride.materialName,
        updatedAt: new Date(),
      })
    } catch (err) {
      console.warn('[product-economics.service] DB updateProductCostProfile failed:', err)
    }
  }

  // Audit logging
  await logAuditEvent({
    action: 'PRODUCT_COST_PROFILE_UPDATED',
    entity: 'ProductCostProfile',
    entityId: productId,
    userId: userId || null,
    metadata: {
      productId,
      sku: existingProfile.sku,
      oldCost: existingProfile.estimatedProductionCostTl,
      changes: input,
      storeId,
    },
  })

  const updatedProfile = await getProductCostProfile(productId, storeId)
  return { success: true, profile: updatedProfile! }
}

// ─────────────────────────────────────────────────────────────
// PRODUCT ECONOMICS & CHANNEL COMPARISON
// ─────────────────────────────────────────────────────────────

export async function getProductEconomics(
  productId: string,
  storeId?: string | null
): Promise<ProductEconomicsDetail | null> {
  const costProfile = await getProductCostProfile(productId, storeId)
  if (!costProfile) return null

  // Resolve base selling price
  let basePrice = 0
  let stock = 0
  const mock = MOCK_PRODUCTS.find((p) => p.id === productId || p.sku === productId)
  if (mock) {
    basePrice = mock.price
    stock = mock.stock
  }

  // Load channel fee configs
  const feeConfigs = await getChannelFeeConfigs(storeId)
  const feeMap = new Map<SalesChannel, ChannelFeeConfig>()
  for (const f of feeConfigs) {
    feeMap.set(f.channel, f)
  }

  // Check actual production orders (Phase 23 integration)
  let actualProductionHistory: ProductEconomicsDetail['actualProductionHistory'] = undefined
  try {
    const prodOrders = await getProductionOrders({ productId })
    const stockedOrders = prodOrders.filter((o) => o.status === 'STOCKED' || o.status === 'COMPLETED')
    if (stockedOrders.length > 0) {
      const totalUnits = stockedOrders.reduce((sum, o) => sum + o.acceptedQuantity, 0)
      actualProductionHistory = {
        orderCount: stockedOrders.length,
        totalProduced: totalUnits,
        lastProducedAt: stockedOrders[0]?.completedAt || null,
        averageActualCostTl: costProfile.estimatedProductionCostTl,
      }
    }
  } catch {}

  // Calculate economics per channel
  const channels: SalesChannel[] = ['ZUULAB', 'TRENDYOL', 'HEPSIBURADA']
  const channelEconomics: Partial<Record<SalesChannel, ChannelEconomics>> = {}

  for (const ch of channels) {
    const channelName = ch === 'ZUULAB' ? 'ZUULAB Kendi Sitesi' : ch === 'TRENDYOL' ? 'Trendyol' : 'Hepsiburada'

    // Pricing can vary by channel; default to product base price
    // E.g., on marketplaces typically +10-15% higher due to commission
    let channelSellingPrice = basePrice
    if (ch === 'TRENDYOL' || ch === 'HEPSIBURADA') {
      // If mock has compareAtPrice or marketplace mapping price, use that
      if (mock?.oldPrice && mock.oldPrice > basePrice) {
        channelSellingPrice = mock.oldPrice
      }
    }

    const econ = evaluateChannelEconomics({
      channel: ch,
      channelName,
      sellingPriceTl: channelSellingPrice > 0 ? channelSellingPrice : null,
      productionCostTl: costProfile.estimatedProductionCostTl,
      costDataStatus: costProfile.costStatus,
      feeConfig: feeMap.get(ch),
    })

    channelEconomics[ch] = econ
  }

  return {
    product: {
      id: costProfile.productId,
      name: costProfile.productName,
      sku: costProfile.sku,
      price: basePrice,
      stock,
    },
    costProfile,
    channelEconomics: channelEconomics as Record<SalesChannel, ChannelEconomics>,
    actualProductionHistory,
  }
}

export async function getChannelComparison(
  productId: string,
  storeId?: string | null
): Promise<Record<SalesChannel, ChannelEconomics> | null> {
  const detail = await getProductEconomics(productId, storeId)
  if (!detail) return null
  return detail.channelEconomics
}

// ─────────────────────────────────────────────────────────────
// HISTORICAL SALES ANALYSIS & DASHBOARD SUMMARY
// ─────────────────────────────────────────────────────────────

export async function getHistoricalSalesEconomics(params?: {
  period?: string // 'today' | '7days' | '30days' | 'this_month' | 'all'
  channel?: string // 'ALL' | 'ZUULAB' | 'TRENDYOL' | 'HEPSIBURADA'
  productId?: string
  storeId?: string | null
}): Promise<HistoricalSalesItemEconomics[]> {
  const results: HistoricalSalesItemEconomics[] = []
  const feeConfigs = await getChannelFeeConfigs(params?.storeId)
  const feeMap = new Map<SalesChannel, ChannelFeeConfig>()
  for (const f of feeConfigs) {
    feeMap.set(f.channel, f)
  }

  // Gather products
  let targetProducts = MOCK_PRODUCTS
  if (params?.productId) {
    targetProducts = targetProducts.filter((p) => p.id === params.productId || p.sku === params.productId)
  }

  // Iterate over products and synthesize actual/estimated sales history
  for (const p of targetProducts) {
    const costProfile = await getProductCostProfile(p.id, params?.storeId)
    const channelsToEvaluate: SalesChannel[] = params?.channel && params.channel !== 'ALL'
      ? [params.channel as SalesChannel]
      : ['ZUULAB', 'TRENDYOL', 'HEPSIBURADA']

    for (const ch of channelsToEvaluate) {
      // Historical sales volume estimation (e.g. from product review count / stock activity)
      const baseUnits = Math.max(1, Math.floor((p.reviewCount || 10) * (ch === 'ZUULAB' ? 0.5 : ch === 'TRENDYOL' ? 0.35 : 0.15)))
      const unitPrice = ch === 'ZUULAB' ? p.price : (p.oldPrice || p.price)
      const grossRevenue = roundMoney(baseUnits * unitPrice)

      const channelEcon = evaluateChannelEconomics({
        channel: ch,
        channelName: ch,
        sellingPriceTl: unitPrice,
        productionCostTl: costProfile?.estimatedProductionCostTl ?? null,
        costDataStatus: costProfile?.costStatus || 'MISSING',
        feeConfig: feeMap.get(ch),
      })

      const totalProductionCost = costProfile?.estimatedProductionCostTl != null
        ? roundMoney(costProfile.estimatedProductionCostTl * baseUnits)
        : null

      const totalCommission = channelEcon.commissionAmountTl != null
        ? roundMoney(channelEcon.commissionAmountTl * baseUnits)
        : null

      const totalShipping = channelEcon.shippingCostTl != null
        ? roundMoney(channelEcon.shippingCostTl * baseUnits)
        : null

      const totalPayment = channelEcon.paymentFeeTl != null
        ? roundMoney(channelEcon.paymentFeeTl * baseUnits)
        : null

      const totalDeductions = roundMoney(
        (totalCommission || 0) + (totalShipping || 0) + (totalPayment || 0)
      )

      let estimatedContributionTl: number | null = null
      let marginPercent: number | null = null

      if (totalProductionCost !== null) {
        estimatedContributionTl = roundMoney(grossRevenue - totalProductionCost - totalDeductions)
        marginPercent = grossRevenue > 0 ? roundMoney((estimatedContributionTl / grossRevenue) * 100) : null
      }

      results.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        channel: ch,
        unitsSold: baseUnits,
        grossRevenueTl: grossRevenue,
        estimatedProductionCostTl: totalProductionCost,
        productionCostSource: costProfile?.costStatus === 'COMPLETE' ? 'ESTIMATED' : 'MANUAL',
        commissionDeductionTl: totalCommission,
        commissionSource: channelEcon.commissionSource,
        shippingDeductionTl: totalShipping,
        shippingSource: channelEcon.shippingSource,
        paymentFeeDeductionTl: totalPayment,
        paymentFeeSource: channelEcon.paymentFeeSource,
        totalKnownDeductionsTl: totalDeductions,
        estimatedContributionTl,
        marginPercent,
        dataCompleteness: costProfile?.costStatus || 'MISSING',
        isEstimate: true,
      })
    }
  }

  return results
}

export async function getEconomicsSummary(params?: {
  period?: string
  channel?: string
  storeId?: string | null
}): Promise<EconomicsSummary> {
  const period = params?.period || 'this_month'
  const channel = params?.channel || 'ALL'

  // Get all product cost profiles
  let completeCount = 0
  let partialCount = 0
  let missingCount = 0

  for (const p of MOCK_PRODUCTS) {
    const prof = await getProductCostProfile(p.id, params?.storeId)
    if (prof?.costStatus === 'COMPLETE') completeCount++
    else if (prof?.costStatus === 'PARTIAL') partialCount++
    else missingCount++
  }

  // Get historical sales rows
  const salesRows = await getHistoricalSalesEconomics({
    period,
    channel,
    storeId: params?.storeId,
  })

  let totalUnitsSold = 0
  let totalGrossRevenueTl = 0
  let totalProductionCost: number | null = 0
  let totalContribution: number | null = 0
  let hasMissingCostsInSales = false

  for (const row of salesRows) {
    totalUnitsSold += row.unitsSold
    totalGrossRevenueTl = roundMoney(totalGrossRevenueTl + row.grossRevenueTl)

    if (row.estimatedProductionCostTl !== null && totalProductionCost !== null) {
      totalProductionCost = roundMoney(totalProductionCost + row.estimatedProductionCostTl)
    } else {
      hasMissingCostsInSales = true
    }

    if (row.estimatedContributionTl !== null && totalContribution !== null) {
      totalContribution = roundMoney(totalContribution + row.estimatedContributionTl)
    }
  }

  const hasSufficientData = completeCount + partialCount > 0
  const avgContribution = totalUnitsSold > 0 && totalContribution !== null
    ? roundMoney(totalContribution / totalUnitsSold)
    : null

  const overallMargin = totalGrossRevenueTl > 0 && totalContribution !== null
    ? roundMoney((totalContribution / totalGrossRevenueTl) * 100)
    : null

  return {
    period,
    channel,
    totalProducts: MOCK_PRODUCTS.length,
    productsWithCompleteCost: completeCount,
    productsWithPartialCost: partialCount,
    productsWithMissingCost: missingCount,
    totalUnitsSold,
    totalGrossRevenueTl: roundMoney(totalGrossRevenueTl),
    totalEstimatedProductionCostTl: totalProductionCost,
    totalEstimatedContributionTl: totalContribution,
    averageEstimatedContributionTl: avgContribution,
    overallMarginPercent: overallMargin,
    isEstimate: true,
    hasSufficientData,
    unavailabilityNotice: hasMissingCostsInSales
      ? 'Bazı ürünlerin maliyet verileri eksik olduğu için toplam katkı yaklaşık hesaplanmıştır.'
      : undefined,
  }
}
