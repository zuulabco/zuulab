export class WarehouseError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: unknown

  constructor(message: string, statusCode: number = 400, code: string = 'WAREHOUSE_ERROR', details?: unknown) {
    super(message)
    this.name = 'WarehouseError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class WarehouseValidationError extends WarehouseError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'WAREHOUSE_VALIDATION_ERROR', details)
    this.name = 'WarehouseValidationError'
  }
}

export class WarehouseNotFoundError extends WarehouseError {
  constructor(message: string, details?: unknown) {
    super(message, 404, 'WAREHOUSE_NOT_FOUND', details)
    this.name = 'WarehouseNotFoundError'
  }
}

export class WarehouseInvalidStateError extends WarehouseError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'WAREHOUSE_INVALID_STATE', details)
    this.name = 'WarehouseInvalidStateError'
  }
}

export class WarehousePermissionError extends WarehouseError {
  constructor(message: string = 'Bu depo işlemi için yetkiniz bulunmamaktadır.', details?: unknown) {
    super(message, 403, 'WAREHOUSE_PERMISSION_DENIED', details)
    this.name = 'WarehousePermissionError'
  }
}

export class WarehouseScanError extends WarehouseError {
  constructor(message: string, code: 'PRODUCT_NOT_FOUND' | 'AMBIGUOUS_BARCODE' | 'EXCESS_QUANTITY' | 'WRONG_ITEM' | 'INACTIVE_FULFILLMENT' = 'PRODUCT_NOT_FOUND', details?: unknown) {
    super(message, 422, `WAREHOUSE_SCAN_${code}`, details)
    this.name = 'WarehouseScanError'
  }
}

export class WarehouseConcurrencyError extends WarehouseError {
  constructor(message: string = 'Eşzamanlı işlem çakışması tespit edildi. Lütfen tekrar deneyiniz.', details?: unknown) {
    super(message, 409, 'WAREHOUSE_CONCURRENCY_ERROR', details)
    this.name = 'WarehouseConcurrencyError'
  }
}

export class WarehouseAllocationError extends WarehouseError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'WAREHOUSE_ALLOCATION_ERROR', details)
    this.name = 'WarehouseAllocationError'
  }
}

export class WarehouseExceptionError extends WarehouseError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'WAREHOUSE_EXCEPTION_ERROR', details)
    this.name = 'WarehouseExceptionError'
  }
}
