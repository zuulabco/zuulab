import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/prisma/db', () => ({ db: {}, isDatabaseConfigured: false }))

const { geliverToShipmentStatus } = await import('@/lib/services/shipping/geliver/geliver.provider')
const { paymentMethodOf } = await import('@/lib/services/orders.service')
const { resolveGeliverLocation } = await import('@/lib/services/shipping/geliver/geliver.client')

describe('Geliver tracking codes', () => {
  it('maps the documented codes to shipment statuses', () => {
    const at = (trackingStatusCode: string, trackingSubStatusCode = '') => geliverToShipmentStatus({ trackingStatusCode, trackingSubStatusCode })
    expect(at('PRE_TRANSIT', 'information_received')).toBe('LABEL_CREATED')
    expect(at('TRANSIT', 'package_accepted')).toBe('SHIPPED')
    expect(at('TRANSIT', 'package_processing')).toBe('IN_TRANSIT')
    expect(at('TRANSIT', 'out_for_delivery')).toBe('OUT_FOR_DELIVERY')
    expect(at('DELIVERED', 'delivered')).toBe('DELIVERED')
    expect(at('FAILURE', 'package_undeliverable')).toBe('DELIVERY_FAILED')
    expect(at('RETURNED', 'return_to_sender')).toBe('RETURNED')
    expect(at('CANCELED', 'package_canceled')).toBe('CANCELLED')
    expect(geliverToShipmentStatus(null)).toBe('LABEL_CREATED')
  })
})

describe('payment method of an order', () => {
  it('tells card, havale/EFT and kapıda ödeme apart', () => {
    expect(paymentMethodOf({ provider: 'PAYTR' })).toBe('CARD')
    expect(paymentMethodOf(null)).toBe('CARD')
    expect(paymentMethodOf({ provider: 'MANUAL', rawResponse: null })).toBe('BANK_TRANSFER')
    expect(paymentMethodOf({ provider: 'MANUAL', rawResponse: { method: 'BANK_TRANSFER', confirmedBy: 'a' } })).toBe('BANK_TRANSFER')
    expect(paymentMethodOf({ provider: 'MANUAL', rawResponse: { method: 'CASH_ON_DELIVERY' } })).toBe('CASH_ON_DELIVERY')
  })
})

describe('Geliver city / district matching', () => {
  const fetchMock = vi.fn(async (url: string) => {
    const data = url.includes('/cities')
      ? [
          { name: 'İstanbul', cityCode: '34' },
          { name: 'Bolu', cityCode: '14' },
        ]
      : [
          { name: 'Merkez', districtID: 107366, cityCode: '14' },
          { name: 'Gerede', districtID: 107665, cityCode: '14' },
          { name: 'Mengen', districtID: 108172, cityCode: '14' },
        ]
    return new Response(JSON.stringify({ result: true, data }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  it('finds the plate code and Geliver spelling regardless of case and Turkish letters', async () => {
    expect(await resolveGeliverLocation('t', 'BOLU', 'merkez')).toEqual({ cityCode: '14', cityName: 'Bolu', districtName: 'Merkez', districtID: 107366 })
    expect((await resolveGeliverLocation('t', 'bolu', 'Bolu Merkez')).districtName).toBe('Merkez')
    expect((await resolveGeliverLocation('t', 'istanbul', '')).cityCode).toBe('34')
  })

  it('refuses unknown places with a message the admin can act on', async () => {
    await expect(resolveGeliverLocation('t', 'Atlantis', 'Merkez')).rejects.toThrow(/Şehir Geliver listesinde bulunamadı/)
    await expect(resolveGeliverLocation('t', 'Bolu', 'Kadıköy')).rejects.toThrow(/İlçe Geliver listesinde bulunamadı/)
  })
})
