import 'server-only'
import { db } from '@/prisma/db'
import { toDbTimestamp } from '@/lib/db/time'
import { SITE_URL } from '@/lib/config/urls'
import { normalizeTrMobile } from '@/lib/validations/phone'
import { getAllOrders, getOrderByNumber, updateOrderStatus, type StoredOrder } from '../orders.service'
import { logAuditEvent } from '../admin.service'
import { createNotification } from '../notification/notification.service'
import { carrierDisplayName } from '@/lib/constants/carriers'
import { cancelShipmentForOrder, getAllShipments } from './fulfillment.service'
import type { StoredShipment } from './shipping.interface'
import {
  acceptGeliverOffer,
  cancelGeliverShipment,
  createGeliverShipment,
  downloadGeliverLabel,
  GeliverError,
  getGeliverBalance,
  getGeliverConfig,
  getGeliverShipment,
  listGeliverParcelTemplates,
  resolveGeliverLocation,
  waitForGeliverOffers,
  type GeliverBalance,
  type GeliverConfig,
  type GeliverParcelTemplate,
  type GeliverShipment,
} from './geliver/geliver.client'
import { GELIVER_COD_SERVICE } from './geliver/geliver.provider'

/**
 * Kapıda ödeme desk. A COD order goes through four steps, each one an admin click:
 *
 *   NEW      → "Geliver'e ekle"        draft shipment in Geliver (nothing is bought)
 *   ADDED    → "Kargoyu hazırla"       address and parcel size checked/edited, offer fixed
 *   READY    → "PTT etiketi oluştur"   the offer is bought from the Geliver balance, label in hand
 *   LABEL…   → tracking comes from the Geliver webhook (shipped, delivered, collected)
 *
 * State lives in the order's GELIVER Shipment row (no schema change): `notes` holds a
 * JSON { cod: { stage, offerId, price, parcel } } while the shipment is a draft.
 */

export type CodStage = 'NEW' | 'ADDED' | 'READY' | 'LABEL' | 'SHIPPED' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

export interface CodParcel {
  length: number
  width: number
  height: number
  weight: number
}

export interface CodAddress {
  fullName: string
  phone: string
  addressLine: string
  city: string
  district: string
  postalCode: string
}

interface CodNotes {
  cod: { stage: 'ADDED' | 'READY' | 'BOUGHT'; offerId?: string; price?: number; parcel?: CodParcel }
}

/** Parcel size when nothing else is chosen: a typical boxed lamp or toy (~2.5 desi) */
export const DEFAULT_COD_PARCEL: CodParcel = { length: 25, width: 20, height: 15, weight: 1 }

const DRAFT_ORDER_STATUSES = ['CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING']

function requireConfig(): GeliverConfig {
  const config = getGeliverConfig()
  if (!config) throw new GeliverError('Geliver yapılandırılmamış: GELIVER_API_TOKEN ve GELIVER_SENDER_ADDRESS_ID gerekli.')
  return config
}

function parseNotes(notes: string | null | undefined): CodNotes['cod'] | null {
  if (!notes || !notes.startsWith('{')) return null
  try {
    return (JSON.parse(notes) as CodNotes).cod ?? null
  } catch {
    return null
  }
}

function stageOf(shipment: StoredShipment | null): CodStage {
  if (!shipment || shipment.provider !== 'GELIVER' || shipment.status === 'CANCELLED') return 'NEW'
  const cod = parseNotes(shipment.notes)
  if (cod?.stage === 'READY') return 'READY'
  if (cod?.stage === 'ADDED') return 'ADDED'
  // A shipment created before this desk existed: bought only when a label or a barcode came
  const bought = !!shipment.labelData || (shipment.trackingNumber && shipment.trackingNumber !== shipment.providerShipmentId)
  if (!cod && !bought) return 'ADDED'
  switch (shipment.status) {
    case 'SHIPPED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'DELIVERY_FAILED':
    case 'RETURNED':
      return 'FAILED'
    default:
      return 'LABEL'
  }
}

export function isCodOrder(order: StoredOrder): boolean {
  return order.paymentMethod === 'CASH_ON_DELIVERY' && (order.channel || 'DIRECT') === 'DIRECT'
}

async function geliverShipmentRow(orderNumber: string): Promise<StoredShipment | null> {
  const all = await getAllShipments({ provider: 'GELIVER', search: orderNumber })
  return all.find((s) => s.orderNumber === orderNumber) ?? null
}

// ─────────────────────────────────────────────────────────────
// List and detail
// ─────────────────────────────────────────────────────────────

export interface CodListItem {
  orderNumber: string
  createdAt: string
  customerName: string
  city: string
  district: string
  totalAmount: number
  orderStatus: string
  paymentStatus: string
  stage: CodStage
  trackingNumber: string | null
  shipmentStatus: string | null
}

export async function listCodOrders(): Promise<CodListItem[]> {
  const [orders, shipments] = await Promise.all([getAllOrders({ limit: 1000 }), getAllShipments({ provider: 'GELIVER' })])
  const byOrder = new Map(shipments.map((s) => [s.orderNumber, s]))
  return orders.filter(isCodOrder).map((o) => {
    const shipment = byOrder.get(o.orderNumber) ?? null
    const stage = o.status === 'CANCELLED' ? 'CANCELLED' : stageOf(shipment)
    const bought = ['LABEL', 'SHIPPED', 'DELIVERED', 'FAILED'].includes(stage)
    return {
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      customerName: o.shippingAddressSnapshot.fullName,
      city: o.shippingAddressSnapshot.city,
      district: o.shippingAddressSnapshot.district,
      totalAmount: o.totalAmount,
      orderStatus: o.status,
      paymentStatus: o.paymentStatus,
      stage,
      trackingNumber: bought ? shipment?.trackingNumber ?? null : null,
      shipmentStatus: bought ? shipment?.status ?? null : null,
    }
  })
}

export interface CodBalanceInfo {
  /** Null when GELIVER_ORGANIZATION_ID is not configured */
  balance: GeliverBalance | null
  error?: string
  topUpUrl: string
}

export async function getCodBalanceInfo(): Promise<CodBalanceInfo> {
  const topUpUrl = process.env.GELIVER_TOPUP_URL?.trim() || 'https://app.geliver.io'
  const config = getGeliverConfig()
  if (!config) return { balance: null, error: 'Geliver yapılandırılmamış.', topUpUrl }
  try {
    return { balance: await getGeliverBalance(config.token), topUpUrl }
  } catch (err) {
    return { balance: null, error: err instanceof Error ? err.message : String(err), topUpUrl }
  }
}

export interface CodDetail {
  order: StoredOrder
  stage: CodStage
  shipment: StoredShipment | null
  offerPrice: number | null
  parcel: CodParcel
  parcelTemplates: Array<{ id: string; name: string; length: number; width: number; height: number; weight: number }>
  testMode: boolean
  configured: boolean
}

export async function getCodDetail(orderNumber: string): Promise<CodDetail> {
  const order = await getOrderByNumber(orderNumber, undefined, true)
  if (!order) throw new Error(`Sipariş bulunamadı: #${orderNumber}`)
  if (!isCodOrder(order)) throw new Error('Bu sipariş kapıda ödemeli değil.')
  const shipment = await geliverShipmentRow(orderNumber)
  const stage = order.status === 'CANCELLED' ? 'CANCELLED' : stageOf(shipment)
  const cod = parseNotes(shipment?.notes)
  const config = getGeliverConfig()

  let templates: GeliverParcelTemplate[] = []
  if (config) templates = await listGeliverParcelTemplates(config.token).catch(() => [])

  return {
    order,
    stage,
    shipment: shipment ? { ...shipment, labelData: undefined } : null,
    offerPrice: cod?.price ?? null,
    parcel: cod?.parcel ?? DEFAULT_COD_PARCEL,
    parcelTemplates: templates.map((t) => ({
      id: t.id,
      name: t.name || 'Şablon',
      length: Number(t.length) || 0,
      width: Number(t.width) || 0,
      height: Number(t.height) || 0,
      weight: Number(t.weight) || 0,
    })),
    testMode: !!config?.testMode,
    configured: !!config,
  }
}

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

const _inFlight = new Set<string>()
async function exclusive<T>(orderNumber: string, fn: () => Promise<T>): Promise<T> {
  if (_inFlight.has(orderNumber)) throw new Error('Bu sipariş için bir işlem zaten sürüyor, birkaç saniye bekleyin.')
  _inFlight.add(orderNumber)
  try {
    return await fn()
  } finally {
    _inFlight.delete(orderNumber)
  }
}

function toE164(phone: string): string {
  const local = normalizeTrMobile(phone)
  if (!local) throw new GeliverError(`Alıcı telefonu geçersiz: "${phone}". Cep telefonunu 05XX XXX XX XX biçiminde girin.`)
  return `+9${local}`
}

function validateParcel(p: CodParcel): CodParcel {
  const clean = { length: Number(p.length), width: Number(p.width), height: Number(p.height), weight: Number(p.weight) }
  for (const [k, v] of Object.entries(clean)) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`Koli ölçüsü geçersiz: ${k}`)
  }
  if (clean.length > 150 || clean.width > 150 || clean.height > 150) throw new Error('Koli kenarı 150 cm’yi geçemez.')
  if (clean.weight > 100) throw new Error('Koli ağırlığı 100 kg’ı geçemez.')
  return clean
}

function validateAddress(a: CodAddress): CodAddress {
  const clean = {
    fullName: a.fullName.trim(),
    phone: a.phone.trim(),
    addressLine: a.addressLine.trim(),
    city: a.city.trim(),
    district: a.district.trim(),
    postalCode: (a.postalCode || '').trim(),
  }
  if (clean.fullName.length < 3) throw new Error('Alıcı adı soyadı eksik.')
  if (clean.addressLine.length < 10) throw new Error('Açık adres çok kısa; mahalle, cadde/sokak ve bina numarasını yazın.')
  if (!clean.city || !clean.district) throw new Error('İl ve ilçe zorunlu.')
  toE164(clean.phone)
  return clean
}

/** A draft shipment in Geliver (POST /shipments) with offers collected; nothing is charged */
async function createDraft(config: GeliverConfig, order: StoredOrder, address: CodAddress, parcel: CodParcel) {
  const location = await resolveGeliverLocation(config.token, address.city, address.district)
  // Geliver's test carrier has no cash-on-delivery offer, so test shipments are plain ones
  const cod = !config.testMode
  const created = await createGeliverShipment(config.token, {
    test: config.testMode,
    senderAddressID: config.senderAddressId,
    returnAddressID: config.returnAddressId,
    length: String(parcel.length),
    width: String(parcel.width),
    height: String(parcel.height),
    distanceUnit: 'cm',
    weight: String(parcel.weight),
    massUnit: 'kg',
    items: order.items.map((i) => ({ title: i.productName.slice(0, 120), quantity: i.quantity })),
    recipientAddress: {
      name: address.fullName,
      email: order.customerEmail || 'musteri@zuulab.com',
      phone: toE164(address.phone),
      address1: address.addressLine.slice(0, 250),
      countryCode: 'TR',
      cityName: location.cityName,
      cityCode: location.cityCode,
      districtName: location.districtName,
      districtID: location.districtID,
      ...(address.postalCode ? { zip: address.postalCode } : {}),
    },
    productPaymentOnDelivery: cod,
    hidePackageContentOnTag: false,
    order: {
      sourceCode: 'API',
      sourceIdentifier: SITE_URL,
      orderNumber: order.orderNumber,
      // For cash on delivery this is what PTT collects at the door
      totalAmount: Number(order.totalAmount.toFixed(2)),
      totalAmountCurrency: 'TL',
    },
  })
  if (!created?.id) throw new GeliverError('Geliver gönderi kimliği dönmedi.')
  const withOffers = await waitForGeliverOffers(config.token, created)
  if (withOffers.hasError) {
    await cancelGeliverShipment(config.token, created.id).catch(() => {})
    throw new GeliverError(`Geliver gönderiyi kabul etmedi: ${withOffers.lastErrorMessage || 'adres veya koli bilgisini kontrol edin'}`)
  }
  const offers = withOffers.offers?.list ?? []
  const offer = config.testMode ? withOffers.offers?.cheapest ?? offers[0] : offers.find((o) => o.providerServiceCode === GELIVER_COD_SERVICE)
  if (!offer) {
    await cancelGeliverShipment(config.token, created.id).catch(() => {})
    throw new GeliverError(
      config.testMode
        ? 'Geliver test için teklif vermedi.'
        : 'Geliver bu adres ve koli ölçüsü için PTT kapıda ödeme teklifi vermedi. Adresi ve ölçüleri kontrol edin ya da Geliver hesabında kapıda ödemenin açık olduğunu doğrulayın.'
    )
  }
  return { shipment: withOffers, offerId: offer.id, price: Number(offer.totalAmount) || 0 }
}

async function writeRow(order: StoredOrder, draft: { shipment: GeliverShipment }, cod: CodNotes['cod'], eventText: string): Promise<void> {
  const now = new Date()
  const fields = {
    providerShipmentId: draft.shipment.id,
    // The barcode appears when the label is bought; until then the Geliver id stands in
    trackingNumber: draft.shipment.id,
    trackingUrl: null,
    status: 'PENDING' as const,
    labelData: null,
    labelFormat: null,
    notes: JSON.stringify({ cod } satisfies CodNotes),
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    webhookDedupeKeys: [] as string[],
    updatedAt: toDbTimestamp(now) as never,
  }
  const previous = await db.orm.public.Shipment.where({ orderId: order.id, provider: 'GELIVER' }).first()
  let shipmentId: string
  if (previous) {
    await db.orm.public.Shipment.where({ id: previous.id }).update(fields as never)
    shipmentId = previous.id
  } else {
    const created = await db.orm.public.Shipment.create({ orderId: order.id, provider: 'GELIVER', ...fields } as never)
    shipmentId = (created as { id: string }).id
  }
  await db.orm.public.ShipmentEvent.create({
    shipmentId,
    status: 'PENDING',
    description: eventText,
    location: 'ZUULAB Atölye',
    eventAt: toDbTimestamp(now) as never,
    rawPayload: null as never,
  })
}

async function loadCodOrder(orderNumber: string): Promise<StoredOrder> {
  const order = await getOrderByNumber(orderNumber, undefined, true)
  if (!order) throw new Error(`Sipariş bulunamadı: #${orderNumber}`)
  if (!isCodOrder(order)) throw new Error('Bu sipariş kapıda ödemeli değil.')
  if (order.status === 'CANCELLED') throw new Error('İptal edilmiş sipariş Geliver’e eklenemez.')
  if (!DRAFT_ORDER_STATUSES.includes(order.status)) {
    throw new Error(`Bu durumdaki sipariş için kargo hazırlanamaz. (Durum: ${order.status})`)
  }
  return order
}

function orderAddress(order: StoredOrder): CodAddress {
  const a = order.shippingAddressSnapshot
  return { fullName: a.fullName, phone: a.phone, addressLine: a.addressLine, city: a.city, district: a.district, postalCode: a.postalCode || '' }
}

/** Removes the previous draft from Geliver (it was never bought, so this is free) */
async function dropOldDraft(config: GeliverConfig, shipment: StoredShipment | null): Promise<void> {
  if (!shipment) return
  const stage = stageOf(shipment)
  if (stage !== 'ADDED' && stage !== 'READY') return
  await cancelGeliverShipment(config.token, shipment.providerShipmentId).catch(() => {})
}

/** Step 1: the order goes to Geliver as a draft shipment */
export function addOrderToGeliver(orderNumber: string, requestedBy?: string): Promise<{ stage: CodStage; message: string }> {
  return exclusive(orderNumber, async () => {
    const config = requireConfig()
    const order = await loadCodOrder(orderNumber)
    const existing = await geliverShipmentRow(orderNumber)
    const stage = stageOf(existing)
    if (stage !== 'NEW') return { stage, message: 'Sipariş zaten Geliver’de.' }

    const parcel = DEFAULT_COD_PARCEL
    const draft = await createDraft(config, order, orderAddress(order), parcel)
    await writeRow(order, draft, { stage: 'ADDED', offerId: draft.offerId, price: draft.price, parcel }, 'Sipariş Geliver’e eklendi (taslak).')
    await logAuditEvent({
      action: 'COD_ADDED_TO_GELIVER',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: { geliverShipmentId: draft.shipment.id, requestedBy },
    }).catch(() => {})
    return { stage: 'ADDED' as const, message: 'Sipariş Geliver’e eklendi.' }
  })
}

/**
 * Step 2: the address and the parcel size are saved and Geliver validates them by
 * offering a price. A changed address is written back to the order. Geliver drafts cannot
 * change their recipient, so the draft is recreated with the corrected data.
 */
export function prepareCodShipment(params: {
  orderNumber: string
  address: CodAddress
  parcel: CodParcel
  requestedBy?: string
}): Promise<{ stage: CodStage; price: number; message: string }> {
  return exclusive(params.orderNumber, async () => {
    const config = requireConfig()
    const order = await loadCodOrder(params.orderNumber)
    const existing = await geliverShipmentRow(params.orderNumber)
    const stage = stageOf(existing)
    if (stage !== 'NEW' && stage !== 'ADDED' && stage !== 'READY') throw new Error('Etiket zaten alınmış; kargo bilgileri artık değiştirilemez.')

    const address = validateAddress(params.address)
    const parcel = validateParcel(params.parcel)

    const draft = await createDraft(config, order, address, parcel)
    // The new draft is in: the old one can go
    await dropOldDraft(config, existing)

    const before = orderAddress(order)
    if (JSON.stringify(before) !== JSON.stringify(address)) {
      await db.orm.public.Order.where({ id: order.id }).update({
        shipToName: address.fullName,
        shipToPhone: address.phone,
        shipToAddress: address.addressLine,
        shipToCity: address.city,
        shipToDistrict: address.district,
        shipToPostal: address.postalCode || order.shippingAddressSnapshot.postalCode || '',
      } as never)
      await logAuditEvent({
        action: 'COD_ADDRESS_EDITED',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: { before, after: address, requestedBy: params.requestedBy },
      }).catch(() => {})
    }

    await writeRow(order, draft, { stage: 'READY', offerId: draft.offerId, price: draft.price, parcel }, 'Kargo bilgileri eklendi (adres ve koli ölçüsü).')
    return { stage: 'READY' as const, price: draft.price, message: 'Kargo bilgileri eklendi.' }
  })
}

/** Step 3: the Geliver offer is bought from the balance and the label comes back */
export function buyCodLabel(orderNumber: string, requestedBy?: string): Promise<{ stage: CodStage; message: string }> {
  return exclusive(orderNumber, async () => {
    const config = requireConfig()
    const order = await loadCodOrder(orderNumber)
    const row = await geliverShipmentRow(orderNumber)
    if (stageOf(row) !== 'READY' || !row) throw new Error('Önce “Kargoyu hazırla” adımını tamamlayın.')
    const cod = parseNotes(row.notes)
    if (!cod?.offerId) throw new Error('Teklif bulunamadı; “Kargoyu hazırla” adımını yeniden kaydedin.')

    const balance = await getGeliverBalance(config.token).catch(() => null)
    if (balance && cod.price && balance.balance < cod.price) {
      throw new Error(`Geliver bakiyesi yetersiz: ${balance.balance.toFixed(2)} TL var, etiket ${cod.price.toFixed(2)} TL. Önce bakiye yükleyin.`)
    }

    const tx = await acceptGeliverOffer(config.token, cod.offerId)
    const shipmentId = tx.shipment?.id || row.providerShipmentId

    // The barcode and the label follow the purchase by a moment
    let shipment = await getGeliverShipment(config.token, shipmentId)
    for (let i = 0; i < 10 && !(shipment.labelURL && (shipment.barcode || shipment.trackingNumber)); i++) {
      await new Promise((r) => setTimeout(r, 2000))
      shipment = await getGeliverShipment(config.token, shipmentId)
    }
    const labelPdf = shipment.labelURL ? await downloadGeliverLabel(config.token, shipment.labelURL).catch(() => null) : null

    const now = new Date()
    await db.orm.public.Shipment.where({ id: row.id }).update({
      trackingNumber: shipment.trackingNumber || shipment.barcode || shipmentId,
      trackingUrl: shipment.trackingUrl || null,
      labelData: labelPdf ? labelPdf.toString('base64') : null,
      labelFormat: labelPdf ? 'PDF' : null,
      notes: JSON.stringify({ cod: { ...cod, stage: 'BOUGHT' } } satisfies CodNotes),
      updatedAt: toDbTimestamp(now) as never,
    } as never)
    await db.orm.public.ShipmentEvent.create({
      shipmentId: row.id,
      status: 'PENDING',
      description: 'PTT kapıda ödeme etiketi oluşturuldu.',
      location: 'ZUULAB Atölye',
      eventAt: toDbTimestamp(now) as never,
      rawPayload: null as never,
    })

    if (order.status === 'CONFIRMED') {
      await updateOrderStatus(order.orderNumber, 'PREPARING', `PTT etiketi oluşturuldu (${shipment.barcode || shipmentId})`, requestedBy || 'admin').catch(() => {})
    }
    await logAuditEvent({
      action: 'COD_LABEL_BOUGHT',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: { geliverShipmentId: shipmentId, price: cod.price, requestedBy },
    }).catch(() => {})
    createNotification({
      orderNumber: order.orderNumber,
      eventType: 'SHIPMENT_CREATED',
      metadata: {
        carrier: carrierDisplayName('GELIVER'),
        trackingNumber: shipment.trackingNumber || shipment.barcode || shipmentId,
        trackingUrl: shipment.trackingUrl || '',
      },
    }).catch(() => {})

    return {
      stage: 'LABEL' as const,
      message: labelPdf ? 'PTT etiketi oluşturuldu.' : 'Etiket satın alındı ancak PDF henüz hazır değil; birkaç saniye sonra “Etiketi indir” ile deneyin.',
    }
  })
}

/** Takes a not-yet-bought order out of Geliver (the draft is deleted there) */
export async function removeCodDraft(orderNumber: string, requestedBy?: string): Promise<void> {
  const row = await geliverShipmentRow(orderNumber)
  const stage = stageOf(row)
  if (stage !== 'ADDED' && stage !== 'READY') throw new Error('Yalnızca satın alınmamış taslak Geliver’den kaldırılabilir.')
  await cancelShipmentForOrder({ orderNumber, reason: 'Geliver taslağı kaldırıldı.', requestedBy })
}
