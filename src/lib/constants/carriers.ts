/**
 * Carrier names shown to admins and customers. Card and havale orders ship with
 * Sürat Kargo (tracking number entered by hand); kapıda ödeme orders ship with
 * PTT Kargo through Geliver.
 */
export const MANUAL_CARRIER = 'SURAT'

export function carrierDisplayName(provider: string | null | undefined): string {
  switch ((provider || '').toUpperCase()) {
    case 'SURAT':
    case 'SURAT_KARGO':
      return 'Sürat Kargo'
    case 'GELIVER':
    case 'PTT':
      return 'PTT Kargo'
    case 'YURTICI':
    case 'YURTICI_KARGO':
      return 'Yurtiçi Kargo'
    case 'MOCK':
    case 'MOCK_CARGO':
      return 'Test Kargo'
    default:
      return provider || 'Kargo'
  }
}

/** Sürat Kargo's public tracking page for a tracking number */
export function suratTrackingUrl(trackingNumber: string): string {
  return `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(trackingNumber)}`
}
