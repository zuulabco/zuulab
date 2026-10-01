export type WarehouseFulfillmentStatus =
  | 'PENDING'
  | 'READY_TO_PICK'
  | 'PICKING'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'READY_FOR_HANDOVER'
  | 'HANDED_OVER'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'BLOCKED'
  | 'FAILED'

export type WarehouseFulfillmentItemStatus =
  | 'PENDING'
  | 'PICKED'
  | 'SHORT'
  | 'OVER'
  | 'PACKED'
  | 'CANCELLED'

export type WarehousePickListStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PICKING'
  | 'COMPLETED'
  | 'CANCELLED'

export type ShippingManifestStatus =
  | 'OPEN'
  | 'READY'
  | 'HANDED_OVER'
  | 'CANCELLED'

export type WarehouseExceptionType =
  | 'SHORT_PICK'
  | 'WRONG_ITEM'
  | 'DAMAGED_ITEM'
  | 'MISSING_ITEM'
  | 'OVER_PICK'
  | 'BARCODE_NOT_FOUND'
  | 'PACKING_MISMATCH'
  | 'SHIPMENT_CREATION_FAILED'
  | 'LABEL_GENERATION_FAILED'
  | 'CARRIER_HANDOVER_FAILED'

export type WarehouseExceptionStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'RESOLVED'
  | 'CANCELLED'

export type WarehouseScanType =
  | 'PICK_SCAN'
  | 'PACK_SCAN'
  | 'LOCATION_SCAN'

export interface WarehouseFulfillmentRecord {
  id: string
  orderId: string | null
  orderNumber: string | null
  marketplaceOrderId: string | null
  marketplaceOrderNumber: string | null
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId: string | null
  status: WarehouseFulfillmentStatus
  priority: number
  warehouseId: string | null
  assignedOperatorId: string | null
  shipmentId: string | null
  startedAt: string | null
  pickedAt: string | null
  packedAt: string | null
  readyForHandoverAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  items?: WarehouseFulfillmentItemRecord[]
}

export interface WarehouseFulfillmentItemRecord {
  id: string
  fulfillmentId: string
  productId: string
  sku: string
  barcode: string | null
  productNameSnapshot: string
  orderedQuantity: number
  reservedQuantity: number
  pickedQuantity: number
  packedQuantity: number
  status: WarehouseFulfillmentItemStatus
  sourceOrderItemId: string | null
  sourceMarketplaceOrderItemId: string | null
  createdAt: string
  updatedAt: string
}

export interface WarehousePickListRecord {
  id: string
  pickListNumber: string
  status: WarehousePickListStatus
  warehouseId: string | null
  assignedOperatorId: string | null
  priority: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  items?: WarehousePickListItemRecord[]
}

export interface WarehousePickListItemRecord {
  id: string
  pickListId: string
  fulfillmentId: string
  fulfillmentItemId: string
  productId: string
  sku: string
  barcode: string | null
  productName: string
  requestedQuantity: number
  pickedQuantity: number
  status: WarehouseFulfillmentItemStatus
  createdAt: string
  updatedAt: string
}

export interface ConsolidatedPickItem {
  productId: string
  sku: string
  barcode: string | null
  productName: string
  totalRequestedQuantity: number
  totalPickedQuantity: number
  allocations: {
    fulfillmentId: string
    fulfillmentItemId: string
    requestedQuantity: number
    pickedQuantity: number
  }[]
}

export interface WarehouseScanEventRecord {
  id: string
  fulfillmentId: string
  fulfillmentItemId: string | null
  operatorId: string
  barcode: string
  scanType: WarehouseScanType
  quantity: number
  success: boolean
  errorCode: string | null
  idempotencyKey: string
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface WarehousePackingSessionRecord {
  id: string
  fulfillmentId: string
  operatorId: string
  packageCount: number
  weightGrams: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  createdAt: string
  completedAt: string | null
}

export interface ShippingManifestRecord {
  id: string
  provider: 'SURAT' | 'PTT' | 'MOCK'
  storeId: string | null
  manifestNumber: string
  status: ShippingManifestStatus
  shipmentCount: number
  totalPackageCount: number
  createdBy: string
  carrierOperatorName: string | null
  notes: string | null
  closedAt: string | null
  handedOverAt: string | null
  createdAt: string
  updatedAt: string
  items?: ShippingManifestItemRecord[]
}

export interface ShippingManifestItemRecord {
  id: string
  manifestId: string
  shipmentId: string
  trackingNumber: string
  orderReference: string
  packageCount: number
  createdAt: string
}

export interface WarehouseExceptionRecord {
  id: string
  fulfillmentId: string
  fulfillmentItemId: string | null
  type: WarehouseExceptionType
  status: WarehouseExceptionStatus
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description: string
  createdBy: string
  resolvedBy: string | null
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface CreateFulfillmentInput {
  orderId?: string
  marketplaceOrderId?: string
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId?: string
  priority?: number
  items: {
    productId: string
    sku: string
    barcode?: string | null
    productName: string
    quantity: number
    sourceOrderItemId?: string
    sourceMarketplaceOrderItemId?: string
  }[]
  orderNumber?: string
  marketplaceOrderNumber?: string
  reconciliationStatus?: string
  isPaymentConfirmed?: boolean
  isReserved?: boolean
}

export interface ScanItemInput {
  fulfillmentId: string
  operatorId: string
  barcode: string
  clientRequestId: string
  quantity?: number
  scanType?: WarehouseScanType
}

export interface ScanItemResult {
  success: boolean
  scannedQuantity: number
  pickedQuantity: number
  packedQuantity?: number
  orderedQuantity: number
  remainingQuantity: number
  productId: string
  sku: string
  barcode: string | null
  productName: string
  isComplete: boolean
  idempotent?: boolean
  message?: string
}

// ─────────────────────────────────────────────────────────────
// PHASE 21 — WAREHOUSE LOCATIONS & PUTAWAY TYPES
// ─────────────────────────────────────────────────────────────

export type WarehouseLocationType =
  | 'WAREHOUSE'
  | 'ZONE'
  | 'AISLE'
  | 'RACK'
  | 'SHELF'
  | 'BIN'

export interface WarehouseLocationRecord {
  id: string
  warehouseId: string
  parentId: string | null
  code: string
  name: string
  type: WarehouseLocationType
  zone: string | null
  aisle: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  capacity: number
  weightCapacityGrams: number | null
  isActive: boolean
  isPickable: boolean
  isPutawayAllowed: boolean
  sortOrder: number
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LocationInventoryRecord {
  id: string
  warehouseId: string
  locationId: string
  productId: string
  sku: string
  quantity: number
  reservedQuantity: number
  lotNumber: string | null
  batchInfo: string | null
  createdAt: string
  updatedAt: string
}

export type InventoryLocationMovementType =
  | 'PUTAWAY'
  | 'RELOCATION'
  | 'PICK'
  | 'RETURN_RESTOCK'
  | 'DAMAGE'
  | 'COUNT_ADJUSTMENT'
  | 'QUARANTINE'

export interface InventoryLocationMovementRecord {
  id: string
  warehouseId: string
  movementType: InventoryLocationMovementType
  sourceLocationId: string | null
  destinationLocationId: string | null
  productId: string
  sku: string
  quantity: number
  operatorId: string
  referenceId: string | null
  idempotencyKey: string
  notes: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface CreateLocationInput {
  warehouseId?: string
  parentId?: string | null
  code: string
  name: string
  type: WarehouseLocationType
  zone?: string | null
  aisle?: string | null
  rack?: string | null
  shelf?: string | null
  bin?: string | null
  capacity?: number
  weightCapacityGrams?: number | null
  isActive?: boolean
  isPickable?: boolean
  isPutawayAllowed?: boolean
  sortOrder?: number
  metadata?: Record<string, unknown> | null
}

export interface PutawayScoreResult {
  location: WarehouseLocationRecord
  score: number
  breakdown: {
    skuAffinity: number
    capacityFit: number
    zonePriority: number
    pickFrequency: number
    locationPriority: number
    travelDistance: number
  }
}

export interface PutawayInput {
  warehouseId?: string
  locationId: string
  productId: string
  sku?: string
  quantity: number
  operatorId: string
  referenceId?: string
  idempotencyKey?: string
  notes?: string
}

// ─────────────────────────────────────────────────────────────
// PHASE 21 — WAVE PICKING & ROUTE OPTIMIZATION TYPES
// ─────────────────────────────────────────────────────────────

export type WarehouseWaveStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface WarehouseWaveRecord {
  id: string
  waveNumber: string
  warehouseId: string
  status: WarehouseWaveStatus
  priority: number
  assignedOperatorId: string | null
  orderCount: number
  totalUnits: number
  estimatedWalkingPath: string | null
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  fulfillments?: WarehouseFulfillmentRecord[]
  items?: WarehouseWaveItemRecord[]
}

export interface WarehouseWaveItemRecord {
  id: string
  waveId: string
  productId: string
  sku: string
  barcode: string | null
  productName: string
  totalRequestedQuantity: number
  totalPickedQuantity: number
  locationId: string | null
  locationCode: string | null
  zone: string | null
  aisle: string | null
  sequence: number
  status: WarehouseFulfillmentItemStatus
  allocations?: {
    fulfillmentId: string
    fulfillmentItemId: string
    requestedQuantity: number
    pickedQuantity: number
  }[]
  createdAt: string
  updatedAt: string
}

export interface PickRouteStep {
  sequence: number
  locationId: string
  locationCode: string
  zone: string
  aisle: string
  shelf: string
  bin: string
  sku: string
  productId: string
  productName: string
  quantity: number
}

export interface PickRoute {
  totalSteps: number
  zonesTraversed: string[]
  pathDescription: string
  steps: PickRouteStep[]
}

export interface CreateWaveInput {
  warehouseId?: string
  fulfillmentIds: string[]
  assignedOperatorId?: string
  notes?: string
  prioritizeApproachingCutoffs?: boolean
}

// ─────────────────────────────────────────────────────────────
// PHASE 21 — CARRIER CUTOFF INTELLIGENCE TYPES
// ─────────────────────────────────────────────────────────────

export type CarrierCutoffAlertLevel = 'NORMAL' | 'APPROACHING' | 'CRITICAL' | 'PASSED'

export interface CarrierCutoffConfigRecord {
  id: string
  carrierKey: string
  carrierName: string
  cutoffTime: string // HH:mm
  pickupDays: number[] // [1, 2, 3, 4, 5, 6]
  timezone: string
  normalThresholdMinutes: number
  approachingThresholdMinutes: number
  isActive: boolean
}

export interface CarrierCutoffSummary {
  carrierKey: string
  carrierName: string
  cutoffTime: string
  nextCutoff: string
  remainingMinutes: number
  alertLevel: CarrierCutoffAlertLevel
  statusLabelTr: string // 'Normal' | 'Yaklaşıyor' | 'Kritik' | 'Geçti'
  waitingShipmentsCount: number
  dispatchPriority: number
}

// ─────────────────────────────────────────────────────────────
// PHASE 21 — RETURN INSPECTION HUB TYPES
// ─────────────────────────────────────────────────────────────

export type WarehouseReturnInspectionStatus =
  | 'PENDING'
  | 'INSPECTING'
  | 'COMPLETED'
  | 'CANCELLED'

export type ReturnInspectionCondition =
  | 'UNOPENED'
  | 'OPEN_BOX'
  | 'USED'
  | 'DAMAGED'
  | 'DEFECTIVE'
  | 'MISSING_PARTS'
  | 'WRONG_ITEM'

export type ReturnInspectionDisposition =
  | 'RESTOCK'
  | 'QUARANTINE'
  | 'SCRAP'
  | 'REPAIR'
  | 'REVIEW'

export interface WarehouseReturnInspectionRecord {
  id: string
  returnRequestId: string
  returnNumber: string
  inspectedBy: string
  status: WarehouseReturnInspectionStatus
  totalExpectedItems: number
  totalInspectedItems: number
  notes: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  items?: WarehouseReturnInspectionItemRecord[]
}

export interface WarehouseReturnInspectionItemRecord {
  id: string
  inspectionId: string
  returnItemId: string | null
  productId: string
  sku: string
  scannedBarcode: string | null
  condition: ReturnInspectionCondition
  disposition: ReturnInspectionDisposition
  quantity: number
  targetLocationId: string | null
  restocked: boolean
  exceptionId: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface InspectItemInput {
  inspectionId: string
  scannedBarcode: string
  condition: ReturnInspectionCondition
  disposition: ReturnInspectionDisposition
  quantity?: number
  targetLocationId?: string
  notes?: string
  adminUserId?: string
  idempotencyVersion?: string
}

// ─────────────────────────────────────────────────────────────
// PHASE 21 — ZEBRA PRINT AGENT TYPES
// ─────────────────────────────────────────────────────────────

export type WarehousePrinterType = 'ZEBRA_ZPL' | 'GENERIC_RAW' | 'PDF_VIRTUAL'

export type WarehousePrintJobStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface WarehousePrinterRecord {
  id: string
  warehouseId: string
  name: string
  printerType: WarehousePrinterType
  ipAddress: string
  port: number
  dpi: number
  labelWidthMm: number
  labelHeightMm: number
  isDefault: boolean
  isActive: boolean
  agentId: string | null
  apiKeyHash: string | null
  lastHeartbeatAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WarehousePrintJobRecord {
  id: string
  printerId: string
  shipmentId: string
  labelId: string | null
  format: 'ZPL' | 'PDF' | 'RAW'
  payloadReference: string
  status: WarehousePrintJobStatus
  attempts: number
  maxAttempts: number
  isReprint: boolean
  idempotencyKey: string
  requestedBy: string
  printedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface RegisterPrinterInput {
  warehouseId?: string
  name: string
  printerType?: WarehousePrinterType
  ipAddress: string
  port?: number
  dpi?: number
  labelWidthMm?: number
  labelHeightMm?: number
  isDefault?: boolean
  agentId?: string
}

export interface RequestPrintJobInput {
  printerId: string
  shipmentId: string
  labelId?: string
  format?: 'ZPL' | 'PDF' | 'RAW'
  requestedBy: string
  isReprint?: boolean
  labelVersion?: string
}

// ─────────────────────────────────────────────────────────────
// PHASE 22 — CYCLE COUNTING & BLIND AUDIT TYPES
// ─────────────────────────────────────────────────────────────

export type WarehouseCountType =
  | 'LOCATION'
  | 'SKU'
  | 'CYCLE'
  | 'SPOT_CHECK'
  | 'FULL_AUDIT'

export type WarehouseCountSessionStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COUNTED'
  | 'UNDER_REVIEW'
  | 'RECOUNT_REQUIRED'
  | 'APPROVED'
  | 'RECONCILED'
  | 'CANCELLED'

export type WarehouseCountLineStatus =
  | 'PENDING'
  | 'COUNTED'
  | 'UNDER_REVIEW'
  | 'RECOUNT_REQUIRED'
  | 'VERIFIED'
  | 'RECONCILED'
  | 'CANCELLED'

export type WarehouseReconciliationStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED'
  | 'CANCELLED'

export interface WarehouseCountHistoryEntry {
  attempt: number
  countedQuantity: number
  countedBy: string
  countedAt: string
  notes?: string
}

export interface WarehouseCountLineRecord {
  id: string
  sessionId: string
  locationId: string
  locationCode: string
  productId: string
  sku: string
  barcode: string | null
  productName: string
  expectedQuantity: number
  countedQuantity: number | null
  varianceQuantity: number | null
  status: WarehouseCountLineStatus
  countedAt: string | null
  countedBy: string | null
  recountCount: number
  countHistory: WarehouseCountHistoryEntry[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface WarehouseCountSessionRecord {
  id: string
  storeId: string | null
  warehouseId: string
  countNumber: string
  type: WarehouseCountType
  status: WarehouseCountSessionStatus
  blindMode: boolean
  createdBy: string
  assignedTo: string | null
  startedAt: string | null
  completedAt: string | null
  approvedAt: string | null
  idempotencyKey: string
  notes: string | null
  createdAt: string
  updatedAt: string
  lines?: WarehouseCountLineRecord[]
  tickets?: WarehouseReconciliationTicketRecord[]
}

export interface WarehouseReconciliationTicketRecord {
  id: string
  ticketNumber: string
  countSessionId: string
  countLineId: string
  storeId: string | null
  locationId: string
  locationCode: string
  productId: string
  sku: string
  productName: string
  expectedQuantity: number
  countedQuantity: number
  varianceQuantity: number
  status: WarehouseReconciliationStatus
  reason: string
  createdBy: string
  reviewedBy: string | null
  approvedAt: string | null
  resolvedAt: string | null
  resolution: string | null
  auditReference: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export interface CreateCountSessionInput {
  warehouseId?: string
  storeId?: string | null
  type?: WarehouseCountType
  blindMode?: boolean
  assignedTo?: string | null
  locationIds?: string[]
  productIds?: string[]
  notes?: string
  createdBy: string
  idempotencyKey?: string
}

export interface SubmitCountScanInput {
  sessionId: string
  locationId?: string
  locationCode?: string
  barcodeOrSku: string
  countedQuantity: number
  countedBy: string
  notes?: string
  idempotencyAttempt?: number
}

// ─────────────────────────────────────────────────────────────
// PHASE 22 — AUTOMATED 3D CARTONIZATION TYPES
// ─────────────────────────────────────────────────────────────

export interface WarehouseCartonRecord {
  id: string
  storeId: string | null
  code: string
  name: string
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
  maxWeightGrams: number
  tareWeightGrams: number
  active: boolean
  priority: number
  createdAt: string
  updatedAt: string
}

export interface CartonizationItemInput {
  productId: string
  sku: string
  quantity: number
  dimensions: {
    lengthMm: number
    widthMm: number
    heightMm: number
  }
  weightGrams: number
  rotationAllowed?: boolean
  fragile?: boolean
}

export interface CartonPlacement {
  productId: string
  sku: string
  position: { x: number; y: number; z: number }
  dimensions: { lengthMm: number; widthMm: number; heightMm: number }
  rotation: string
}

export interface CartonizationResult {
  success: boolean
  recommendedCarton: WarehouseCartonRecord | null
  estimatedUsedVolumeMm3: number
  cartonVolumeMm3: number
  volumeUtilizationPercent: number
  estimatedWeightGrams: number
  placements: CartonPlacement[]
  reason?: string
  errorCode?: 'NO_FITTING_CARTON' | 'EXCEEDS_MAX_WEIGHT' | 'EXCEEDS_DIMENSIONS' | 'INVALID_INPUT'
  diagnostics?: string
}

export interface CreateCartonInput {
  storeId?: string | null
  code: string
  name: string
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
  maxWeightGrams: number
  tareWeightGrams?: number
  active?: boolean
  priority?: number
}

