import type { Destination } from '../dispatcher'
import { getMetaCapiConfig } from '../meta-config'
import { metaCapiEventName } from '../mapping'
import { buildCapiPayload } from './meta-capi-payload'

/**
 * Meta Conversions API, called from the server. Registered only on the server dispatcher,
 * so the access token never reaches the browser. It is skipped (accepts nothing) until
 * META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set, and, like every marketing
 * destination, for events whose consent is not "all".
 *
 * The dispatcher already bounds the time and swallows errors; a failure here is logged
 * (without the token) and never touches an order or a payment.
 */

const REQUEST_TIMEOUT_MS = 2500

export const metaCapiDestination: Destination = {
  id: 'meta-capi',
  consent: 'marketing',
  accepts(event) {
    return getMetaCapiConfig() !== null && metaCapiEventName(event.eventName) !== null
  },
  async send(event) {
    const config = getMetaCapiConfig()
    if (!config) return
    const payload = buildCapiPayload(event, { testEventCode: config.testEventCode })
    if (!payload) return

    const res = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, access_token: config.accessToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => null)
      const message = (detail as { error?: { message?: string; code?: number } } | null)?.error
      throw new Error(`Meta CAPI ${res.status}${message ? `: ${message.message} (code ${message.code})` : ''}`)
    }
  },
}
