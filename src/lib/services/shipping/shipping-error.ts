export type CargoErrorCode =
  | 'CARGO_AUTH_ERROR'
  | 'CARGO_RATE_LIMIT'
  | 'CARGO_TIMEOUT'
  | 'CARGO_VALIDATION_ERROR'
  | 'CARGO_NOT_FOUND'
  | 'CARGO_PROVIDER_ERROR'
  | 'CARGO_LABEL_ERROR'
  | 'CARGO_WEBHOOK_INVALID'
  | 'CARGO_DUPLICATE'
  | 'CARGO_INVALID_STATE'
  | 'CARGO_NOT_IMPLEMENTED'
  | 'CARGO_RECONCILIATION_BLOCKED'

export class CargoError extends Error {
  public readonly code: CargoErrorCode
  public readonly retryable: boolean
  public readonly provider?: string
  public readonly details?: unknown

  constructor(params: {
    message: string
    code: CargoErrorCode
    retryable?: boolean
    provider?: string
    details?: unknown
  }) {
    super(params.message)
    this.name = 'CargoError'
    this.code = params.code
    this.retryable = params.retryable ?? false
    this.provider = params.provider
    this.details = params.details
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class CargoAuthError extends CargoError {
  constructor(message = 'Kargo sağlayıcı kimlik doğrulama hatası', provider?: string) {
    super({ message, code: 'CARGO_AUTH_ERROR', retryable: false, provider })
  }
}

export class CargoRateLimitError extends CargoError {
  constructor(message = 'Kargo API istek limiti aşıldı (Rate limit)', provider?: string) {
    super({ message, code: 'CARGO_RATE_LIMIT', retryable: true, provider })
  }
}

export class CargoTimeoutError extends CargoError {
  constructor(message = 'Kargo sağlayıcı API zaman aşımı (Timeout)', provider?: string) {
    super({ message, code: 'CARGO_TIMEOUT', retryable: true, provider })
  }
}

export class CargoValidationError extends CargoError {
  constructor(message: string, provider?: string, details?: unknown) {
    super({ message, code: 'CARGO_VALIDATION_ERROR', retryable: false, provider, details })
  }
}

export class CargoNotFoundError extends CargoError {
  constructor(message = 'Gönderi veya kargo kaydı bulunamadı', provider?: string) {
    super({ message, code: 'CARGO_NOT_FOUND', retryable: false, provider })
  }
}

export class CargoProviderError extends CargoError {
  constructor(message: string, retryable = true, provider?: string, details?: unknown) {
    super({ message, code: 'CARGO_PROVIDER_ERROR', retryable, provider, details })
  }
}

export class CargoLabelError extends CargoError {
  constructor(message: string, retryable = false, provider?: string) {
    super({ message, code: 'CARGO_LABEL_ERROR', retryable, provider })
  }
}

export class CargoWebhookInvalidError extends CargoError {
  constructor(message = 'Geçersiz kargo webhook isteği veya imza hatası', provider?: string) {
    super({ message, code: 'CARGO_WEBHOOK_INVALID', retryable: false, provider })
  }
}

export class CargoDuplicateError extends CargoError {
  constructor(message = 'Bu kargo gönderisi veya takip numarası zaten mevcut', provider?: string) {
    super({ message, code: 'CARGO_DUPLICATE', retryable: false, provider })
  }
}

export class CargoInvalidStateError extends CargoError {
  constructor(message: string, provider?: string) {
    super({ message, code: 'CARGO_INVALID_STATE', retryable: false, provider })
  }
}

export class CargoNotImplementedError extends CargoError {
  constructor(operation: string, provider?: string) {
    super({
      message: `'${operation}' operasyonu bu sağlayıcı (${provider || 'UNKNOWN'}) tarafından desteklenmemektedir`,
      code: 'CARGO_NOT_IMPLEMENTED',
      retryable: false,
      provider,
    })
  }
}
