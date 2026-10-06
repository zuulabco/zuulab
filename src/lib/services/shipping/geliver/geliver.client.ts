import 'server-only'
import { provinceKey } from '@/lib/geo/tr-provinces'

/**
 * Geliver (https://docs.geliver.io) REST client: a shipping marketplace that buys
 * PTT Kargo labels for us, including cash-on-delivery ("kapıda ödeme") shipments,
 * and reports tracking through a webhook.
 *
 * Every response is an envelope { result, data, additionalMessage }; result false
 * is an error even with HTTP 200.
 */

const BASE_URL = 'https://api.geliver.io/api/v1'

export class GeliverError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'GeliverError'
  }
}

export interface GeliverConfig {
  token: string
  senderAddressId: string
  returnAddressId: string
  /** Test shipments (Geliver's test carrier); never true in production */
  testMode: boolean
}

/** Null when the token or the sender address is not configured */
export function getGeliverConfig(): GeliverConfig | null {
  const token = process.env.GELIVER_API_TOKEN?.trim()
  const senderAddressId = process.env.GELIVER_SENDER_ADDRESS_ID?.trim()
  if (!token || !senderAddressId) return null
  return {
    token,
    senderAddressId,
    returnAddressId: process.env.GELIVER_RETURN_ADDRESS_ID?.trim() || senderAddressId,
    testMode: process.env.GELIVER_TEST_MODE === 'true',
  }
}

export async function geliverRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    throw new GeliverError(`Geliver'e ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`)
  }
  const json = (await res.json().catch(() => null)) as {
    result?: boolean
    data?: T
    additionalMessage?: string
    message?: string
    code?: string
  } | null
  if (!res.ok || !json || json.result === false) {
    const detail = json?.additionalMessage || json?.message || `HTTP ${res.status}`
    throw new GeliverError(`Geliver hatası: ${detail}${json?.code ? ` (${json.code})` : ''}`, res.status, json?.code)
  }
  return json.data as T
}

// ─────────────────────────────────────────────────────────────
// Cities / districts: Geliver wants the plate code and its own district name
// ─────────────────────────────────────────────────────────────

interface GeliverCity {
  name: string
  cityCode: string
}
interface GeliverDistrict {
  name: string
  districtID: number
  cityCode: string
}

let citiesCache: Promise<GeliverCity[]> | null = null
const districtsCache = new Map<string, Promise<GeliverDistrict[]>>()

function listCities(token: string): Promise<GeliverCity[]> {
  citiesCache ??= geliverRequest<GeliverCity[]>(token, 'GET', '/cities?countryCode=TR').catch((err) => {
    citiesCache = null
    throw err
  })
  return citiesCache
}

function listDistricts(token: string, cityCode: string): Promise<GeliverDistrict[]> {
  let cached = districtsCache.get(cityCode)
  if (!cached) {
    cached = geliverRequest<GeliverDistrict[]>(token, 'GET', `/districts?countryCode=TR&cityCode=${encodeURIComponent(cityCode)}`).catch(
      (err) => {
        districtsCache.delete(cityCode)
        throw err
      }
    )
    districtsCache.set(cityCode, cached)
  }
  return cached
}

/** "Bolu" + "merkez" → { cityCode: "14", districtName: "Merkez", districtID } in Geliver's spelling */
export async function resolveGeliverLocation(
  token: string,
  city: string,
  district: string
): Promise<{ cityCode: string; cityName: string; districtName: string; districtID: number }> {
  const cities = await listCities(token)
  const cityHit = cities.find((c) => provinceKey(c.name) === provinceKey(city))
  if (!cityHit) throw new GeliverError(`Şehir Geliver listesinde bulunamadı: "${city}". Teslimat adresindeki ili kontrol edin.`)
  const districts = await listDistricts(token, cityHit.cityCode)
  const want = provinceKey(district || 'Merkez')
  // Exact name first; otherwise "Bolu Merkez", "Merkez İlçe" and the like, when only one district fits
  const loose = districts.filter((d) => want.includes(provinceKey(d.name)) || provinceKey(d.name).includes(want))
  const districtHit = districts.find((d) => provinceKey(d.name) === want) ?? (loose.length === 1 ? loose[0] : undefined)
  if (!districtHit) {
    throw new GeliverError(
      `İlçe Geliver listesinde bulunamadı: "${district}" (${cityHit.name}). Teslimat adresindeki ilçeyi düzeltip tekrar deneyin.`
    )
  }
  return { cityCode: cityHit.cityCode, cityName: cityHit.name, districtName: districtHit.name, districtID: districtHit.districtID }
}

// ─────────────────────────────────────────────────────────────
// Shipments
// ─────────────────────────────────────────────────────────────

export interface GeliverTrackingStatus {
  trackingStatusCode?: string | null
  trackingSubStatusCode?: string | null
  statusDetails?: string | null
  statusDate?: string | null
  locationName?: string | null
  updatedAt?: string | null
}

export interface GeliverShipment {
  id: string
  barcode?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  labelURL?: string | null
  statusCode?: string | null
  productPaymentOnDelivery?: boolean
  trackingStatus?: GeliverTrackingStatus | null
  offers?: GeliverOfferList | null
  hasError?: boolean
  lastErrorMessage?: string | null
  test?: boolean
}

export interface GeliverOffer {
  id: string
  providerCode?: string
  providerServiceCode?: string
  totalAmount?: string
}

export interface GeliverOfferList {
  cheapest?: GeliverOffer | null
  list?: GeliverOffer[] | null
  percentageCompleted?: string | number
}

export interface GeliverParcelTemplate {
  id: string
  name?: string
  length?: string
  width?: string
  height?: string
  weight?: string
  isActive?: boolean
}

export interface GeliverTransaction {
  id: string
  isPayed?: boolean
  totalAmount?: string
  shipment: GeliverShipment
}

export function getGeliverShipment(token: string, shipmentId: string): Promise<GeliverShipment> {
  return geliverRequest<GeliverShipment>(token, 'GET', `/shipments/${encodeURIComponent(shipmentId)}`)
}

export function cancelGeliverShipment(token: string, shipmentId: string): Promise<GeliverShipment> {
  return geliverRequest<GeliverShipment>(token, 'DELETE', `/shipments/${encodeURIComponent(shipmentId)}`)
}

/** One-step label purchase (POST /transactions) */
export function createGeliverTransaction(token: string, body: unknown): Promise<GeliverTransaction> {
  return geliverRequest<GeliverTransaction>(token, 'POST', '/transactions', body)
}

/** The label PDF; Geliver's label links are fetched with the API token */
export async function downloadGeliverLabel(token: string, labelUrl: string): Promise<Buffer> {
  const res = await fetch(labelUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new GeliverError(`Kargo etiketi indirilemedi (HTTP ${res.status}).`, res.status)
  return Buffer.from(await res.arrayBuffer())
}

/** Draft shipment (POST /shipments): nothing is bought yet, Geliver only collects offers */
export function createGeliverShipment(token: string, body: unknown): Promise<GeliverShipment> {
  return geliverRequest<GeliverShipment>(token, 'POST', '/shipments', body)
}

/** Buys the label of an offered shipment: charges the Geliver balance */
export function acceptGeliverOffer(token: string, offerID: string): Promise<GeliverTransaction> {
  return geliverRequest<GeliverTransaction>(token, 'POST', '/transactions', { offerID })
}

/** Offers arrive a moment after the shipment is created: polls until they are in */
export async function waitForGeliverOffers(token: string, shipment: GeliverShipment, timeoutMs = 25_000): Promise<GeliverShipment> {
  const done = (s: GeliverShipment) => !!s.offers && (!!s.offers.cheapest || Number(s.offers.percentageCompleted) >= 100)
  let current = shipment
  const start = Date.now()
  while (!done(current)) {
    if (Date.now() - start > timeoutMs) break
    await new Promise((r) => setTimeout(r, 1500))
    current = await getGeliverShipment(token, shipment.id)
  }
  return current
}

export async function listGeliverParcelTemplates(token: string): Promise<GeliverParcelTemplate[]> {
  const list = await geliverRequest<GeliverParcelTemplate[]>(token, 'GET', '/parceltemplates')
  return (list ?? []).filter((t) => t.isActive !== false)
}

export interface GeliverBalance {
  balance: number
  debt: number
}

/** The account balance; null when GELIVER_ORGANIZATION_ID is not set (the API needs it) */
export async function getGeliverBalance(token: string): Promise<GeliverBalance | null> {
  const orgId = process.env.GELIVER_ORGANIZATION_ID?.trim()
  if (!orgId) return null
  const res = await fetch(`${BASE_URL}/organizations/${encodeURIComponent(orgId)}/balance`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => null)) as { result?: boolean; data?: string; debt?: string } | null
  if (!res.ok || !json || json.result === false) throw new GeliverError('Geliver bakiyesi okunamadı (organizasyon kimliğini kontrol edin).', res.status)
  return { balance: Number(json.data ?? 0) || 0, debt: Number(json.debt ?? 0) || 0 }
}
