import type { ICargoProvider } from '../shipping.interface'
import type {
  CarrierProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  ShipmentStatusResult,
  CancelShipmentResult,
  CreateLabelRequest,
  ShippingLabelResult,
  ShipmentTrackingResult,
  CarrierConnectionTestResult,
  ShippingAddressInput,
  ShippingShipmentStatus,
} from '../shipping-types'
import {
  CargoValidationError,
  CargoError,
  CargoProviderError,
  CargoTimeoutError,
  CargoRateLimitError,
  CargoAuthError,
} from '../shipping-error'

export abstract class BaseCargoProvider implements ICargoProvider {
  public abstract readonly provider: CarrierProviderType
  public abstract readonly carrierName: string

  public abstract testConnection(): Promise<CarrierConnectionTestResult>
  public abstract createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>
  public abstract getShipment(trackingNumber: string): Promise<ShipmentStatusResult>
  public abstract cancelShipment(shipmentId: string): Promise<CancelShipmentResult>
  public abstract createLabel(request: CreateLabelRequest): Promise<ShippingLabelResult>
  public abstract getLabel(labelIdOrTracking: string): Promise<ShippingLabelResult>
  public abstract getTracking(trackingNumber: string): Promise<ShipmentTrackingResult>

  /**
   * Validates mandatory recipient address fields according to carrier requirements
   */
  public validateAddress(recipient: ShippingAddressInput): void {
    if (!recipient.fullName || recipient.fullName.trim().length < 3) {
      throw new CargoValidationError(
        'Alıcı adı ve soyadı en az 3 karakter olmalıdır.',
        this.provider
      )
    }

    if (!recipient.phone || recipient.phone.replace(/[^0-9]/g, '').length < 10) {
      throw new CargoValidationError(
        'Geçerli bir telefon numarası zorunludur (en az 10 hane).',
        this.provider
      )
    }

    if (!recipient.addressLine || recipient.addressLine.trim().length < 5) {
      throw new CargoValidationError(
        'Teslimat adresi yetersiz veya eksik (en az 5 karakter gereklidir).',
        this.provider
      )
    }

    if (!recipient.city || recipient.city.trim().length < 2) {
      throw new CargoValidationError('Şehir bilgisi zorunludur.', this.provider)
    }

    if (!recipient.district || recipient.district.trim().length < 2) {
      throw new CargoValidationError('İlçe bilgisi zorunludur.', this.provider)
    }
  }

  /**
   * Deterministic Turkish phone normalization
   * Normalizes formats like: +90 532 123 4567, 0532 123 45 67, 5321234567 -> 05321234567
   */
  public normalizeTurkishPhone(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '')
    if (digits.length === 12 && digits.startsWith('90')) {
      return `0${digits.slice(2)}`
    }
    if (digits.length === 10 && digits.startsWith('5')) {
      return `0${digits}`
    }
    if (digits.length === 11 && digits.startsWith('05')) {
      return digits
    }
    return digits
  }

  /**
   * Normalizes carrier-specific status string into canonical ShippingShipmentStatus
   */
  public abstract normalizeStatus(rawStatus: string): ShippingShipmentStatus

  /**
   * Maps unhandled runtime or network exceptions into typed CargoError
   */
  protected mapException(err: unknown, operation: string): CargoError {
    if (err instanceof CargoError) return err

    const message = err instanceof Error ? err.message : String(err)
    const lower = message.toLowerCase()

    if (lower.includes('rate limit') || lower.includes('429')) {
      return new CargoRateLimitError(`[${this.provider}] ${operation}: ${message}`, this.provider)
    }
    if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('etimedout')) {
      return new CargoTimeoutError(`[${this.provider}] ${operation}: ${message}`, this.provider)
    }
    if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('403') || lower.includes('kimlik')) {
      return new CargoAuthError(`[${this.provider}] ${operation}: ${message}`, this.provider)
    }

    return new CargoProviderError(`[${this.provider}] ${operation}: ${message}`, true, this.provider)
  }
}
