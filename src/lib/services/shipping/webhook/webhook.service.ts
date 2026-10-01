import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { CargoWebhookInvalidError } from '../shipping-error'
import { CargoProviderFactory } from '../shipping.factory'
import type { CarrierProviderType, ShippingShipmentStatus } from '../shipping-types'

export interface ProcessWebhookInput {
  provider: CarrierProviderType
  rawBody: string
  signature?: string | null
  headers?: Record<string, string | null>
  timestamp?: number | string | null
}

export interface ProcessWebhookResult {
  success: boolean
  status: 'PROCESSED' | 'IGNORED_DUPLICATE' | 'FAILED' | 'UNKNOWN'
  eventId: string
  shipmentId?: string | null
  newStatus?: ShippingShipmentStatus
  message: string
}

export interface StoredWebhookEvent {
  id: string
  provider: CarrierProviderType
  shipmentId: string | null
  externalEventId: string
  eventType: string
  payload: Record<string, unknown>
  processed: boolean
  processedAt: string | null
  status: 'PROCESSED' | 'IGNORED_DUPLICATE' | 'FAILED' | 'UNKNOWN'
  createdAt: string
}

// In-memory webhook event deduplication fallback
const inMemoryWebhookEvents: Map<string, StoredWebhookEvent> = new Map()

export class ShippingWebhookService {
  public static readonly REPLAY_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

  /**
   * Authoritative entrypoint for carrier webhook events
   */
  public static async processWebhook(
    input: ProcessWebhookInput,
    onStatusTransition?: (
      shipmentIdentifier: { trackingNumber?: string; externalShipmentId?: string },
      newStatus: ShippingShipmentStatus,
      rawPayload: Record<string, unknown>
    ) => Promise<{ shipmentId: string; status: ShippingShipmentStatus }>
  ): Promise<ProcessWebhookResult> {
    const providerInstance = CargoProviderFactory.getProvider(input.provider)

    // 1. Signature Verification
    if (providerInstance.verifyWebhookSignature && input.signature) {
      const isValid = providerInstance.verifyWebhookSignature(input.rawBody, input.signature)
      if (!isValid) {
        throw new CargoWebhookInvalidError(
          `[${input.provider}] Webhook imza doğrulaması başarısız oldu.`,
          input.provider
        )
      }
    }

    // 2. Parse JSON payload
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(input.rawBody)
    } catch {
      throw new CargoWebhookInvalidError(
        `[${input.provider}] Geçersiz JSON webhook içeriği.`,
        input.provider
      )
    }

    // 3. Timestamp & Replay Attack Defense
    const eventTimeStr = (parsed.timestamp || parsed.eventTime || parsed.eventDate || input.timestamp) as
      | string
      | number
      | undefined
    if (eventTimeStr) {
      const eventTime = new Date(eventTimeStr).getTime()
      if (!isNaN(eventTime)) {
        const age = Math.abs(Date.now() - eventTime)
        if (age > this.REPLAY_WINDOW_MS && process.env.NODE_ENV === 'production') {
          throw new CargoWebhookInvalidError(
            `[${input.provider}] Replay attack koruması: Olay zaman damgası geçerli pencerenin (${this.REPLAY_WINDOW_MS / 60000} dk) dışındadır.`,
            input.provider
          )
        }
      }
    }

    // 4. Extract external event ID & deduplication
    const externalEventId = String(
      parsed.eventId ||
        parsed.eventRef ||
        parsed.id ||
        parsed.transactionId ||
        crypto.createHash('sha256').update(input.rawBody).digest('hex')
    )

    const dedupeKey = `${input.provider}:${externalEventId}`

    // Check existing
    const existing = await this.getWebhookEvent(input.provider, externalEventId)
    if (existing) {
      await logAuditEvent({
        action: 'shipping.webhook.duplicate',
        entity: 'ShippingWebhookEvent',
        entityId: externalEventId,
        metadata: { provider: input.provider, status: 'IGNORED_DUPLICATE' },
      })

      return {
        success: true,
        status: 'IGNORED_DUPLICATE',
        eventId: externalEventId,
        shipmentId: existing.shipmentId,
        message: 'Duplicate webhook event received; ignored safely without reprocessing.',
      }
    }

    // 5. Sanitize payload (strip credentials / auth headers)
    const sanitizedPayload = this.sanitizePayload(parsed)

    // 6. Extract shipment identifiers & normalized status
    const trackingNumber = (parsed.trackingNumber || parsed.cargoKey || parsed.barcode || parsed.takipNo) as
      | string
      | undefined
    const externalShipmentId = (parsed.shipmentId || parsed.externalId || parsed.gonderiNo) as
      | string
      | undefined
    const rawStatus = String(parsed.status || parsed.durum || parsed.statusText || 'IN_TRANSIT')
    const normalizedStatus = providerInstance.normalizeStatus(rawStatus)

    let finalShipmentId: string | null = null
    let resultStatus: 'PROCESSED' | 'UNKNOWN' = 'PROCESSED'

    if (onStatusTransition && (trackingNumber || externalShipmentId)) {
      try {
        const transResult = await onStatusTransition(
          { trackingNumber, externalShipmentId },
          normalizedStatus,
          sanitizedPayload
        )
        finalShipmentId = transResult.shipmentId
      } catch (err: any) {
        // Unknown shipment or transition issue: safely record without crashing
        console.warn(`[ShippingWebhook] Transition notice for ${trackingNumber}:`, err.message)
        resultStatus = 'UNKNOWN'
      }
    } else {
      resultStatus = 'UNKNOWN'
    }

    // 7. Store webhook record
    const storedEvent: StoredWebhookEvent = {
      id: `whk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      provider: input.provider,
      shipmentId: finalShipmentId,
      externalEventId,
      eventType: String(parsed.eventType || parsed.event || 'STATUS_UPDATE'),
      payload: sanitizedPayload,
      processed: true,
      processedAt: new Date().toISOString(),
      status: resultStatus,
      createdAt: new Date().toISOString(),
    }

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingWebhookEvent.create({
          id: storedEvent.id,
          provider: storedEvent.provider,
          shipmentId: storedEvent.shipmentId,
          externalEventId: storedEvent.externalEventId,
          eventType: storedEvent.eventType,
          payload: storedEvent.payload,
          processed: true,
          processedAt: new Date(),
          status: storedEvent.status,
        })
      } catch (err) {
        console.warn('[ShippingWebhook] DB persistence fallback to memory:', err)
      }
    }

    inMemoryWebhookEvents.set(dedupeKey, storedEvent)

    await logAuditEvent({
      action: 'shipping.webhook.processed',
      entity: 'ShippingWebhookEvent',
      entityId: externalEventId,
      metadata: {
        provider: input.provider,
        shipmentId: finalShipmentId,
        normalizedStatus,
        status: resultStatus,
      },
    })

    return {
      success: true,
      status: resultStatus,
      eventId: externalEventId,
      shipmentId: finalShipmentId,
      newStatus: normalizedStatus,
      message:
        resultStatus === 'PROCESSED'
          ? 'Webhook event processed and shipment status updated successfully.'
          : 'Webhook event recorded safely; shipment lookup requires review.',
    }
  }

  public static async getWebhookEvent(
    provider: CarrierProviderType,
    externalEventId: string
  ): Promise<StoredWebhookEvent | null> {
    const dedupeKey = `${provider}:${externalEventId}`
    if (inMemoryWebhookEvents.has(dedupeKey)) {
      return inMemoryWebhookEvents.get(dedupeKey)!
    }

    if (isDatabaseConfigured) {
      try {
        const r = await (db.orm.public as any).ShippingWebhookEvent.findFirst({
          where: { provider, externalEventId },
        })
        if (r) {
          return {
            id: r.id,
            provider: r.provider as CarrierProviderType,
            shipmentId: r.shipmentId,
            externalEventId: r.externalEventId,
            eventType: r.eventType,
            payload: r.payload,
            processed: r.processed,
            processedAt: r.processedAt?.toISOString?.() ?? null,
            status: r.status,
            createdAt: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
          }
        }
      } catch {}
    }

    return null
  }

  /**
   * Strips secret tokens, authorization keys, passwords from logged payloads
   */
  private static sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}
    const sensitiveKeys = [
      'authorization',
      'password',
      'secret',
      'token',
      'apikey',
      'api_key',
      'auth',
      'sifre',
    ]

    for (const [k, v] of Object.entries(payload)) {
      const lower = k.toLowerCase()
      if (sensitiveKeys.some((s) => lower.includes(s))) {
        sanitized[k] = '[REDACTED]'
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        sanitized[k] = this.sanitizePayload(v as Record<string, unknown>)
      } else {
        sanitized[k] = v
      }
    }

    return sanitized
  }
}
