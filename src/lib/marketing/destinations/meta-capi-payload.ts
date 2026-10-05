import { createHash } from 'node:crypto'
import type { MarketingEvent } from '../events'
import { metaCapiEventName } from '../mapping'
import { toMetaCustomData } from './meta-shared'

/**
 * The body of a Meta Conversions API request for one canonical event. Pure (no network,
 * no env) so the rules can be tested.
 *
 * Personal data is sent only as Meta asks: normalised, then SHA-256 hashed (email, phone,
 * name, city, postal code, country, external id). IP address, user agent and the _fbp /
 * _fbc cookies are sent as they are. Nothing else about the person is included.
 */

export const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

const lower = (v: string | undefined) => (v ?? '').trim().toLocaleLowerCase('tr-TR')

export function hashEmail(email: string | undefined): string | undefined {
  const v = lower(email)
  return v.includes('@') ? sha256(v) : undefined
}

/** Digits only, with the country code (Turkey: 0 5xx… / 5xx… → 905xx…) */
export function normalizePhone(phone: string | undefined): string | undefined {
  let d = (phone ?? '').replace(/\D/g, '')
  if (!d) return undefined
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = `90${d.slice(1)}`
  else if (d.length === 10) d = `90${d}`
  return d.length >= 10 ? d : undefined
}

const hashedLetters = (v: string | undefined) => {
  const t = lower(v).replace(/[^\p{L}\p{N}]/gu, '')
  return t ? sha256(t) : undefined
}

export interface CapiUserData {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  zp?: string[]
  country?: string[]
  external_id?: string[]
  client_ip_address?: string
  client_user_agent?: string
  fbp?: string
  fbc?: string
}

export function buildUserData(event: MarketingEvent): CapiUserData {
  const u = event.user ?? {}
  const c = event.client ?? {}
  const out: CapiUserData = {}
  const set = <K extends keyof CapiUserData>(key: K, value: CapiUserData[K] | undefined) => {
    if (value !== undefined && !(Array.isArray(value) && value.length === 0)) out[key] = value
  }
  const one = (h: string | undefined) => (h ? [h] : [])

  set('em', one(hashEmail(u.email)))
  const phone = normalizePhone(u.phone)
  set('ph', one(phone ? sha256(phone) : undefined))
  set('fn', one(hashedLetters(u.firstName)))
  set('ln', one(hashedLetters(u.lastName)))
  set('ct', one(hashedLetters(u.city)))
  set('zp', one(hashedLetters(u.postalCode)))
  set('country', one(hashedLetters(u.country ?? (u.city ? 'tr' : undefined))))
  set(
    'external_id',
    [event.userId, event.anonymousId].filter((v): v is string => Boolean(v)).map((v) => sha256(v))
  )
  set('client_ip_address', c.ip)
  set('client_user_agent', c.userAgent)
  set('fbp', c.fbp)
  set('fbc', c.fbc)
  return out
}

/** `fb.1.<click time ms>.<fbclid>`, Meta's format when only the click id is known */
export function fbcFromClickId(fbclid: string | undefined, clickedAt: number): string | undefined {
  return fbclid ? `fb.1.${clickedAt}.${fbclid}` : undefined
}

export interface CapiPayloadOptions {
  testEventCode?: string
}

/** The request body, or null when this event has no Meta server equivalent or lacks data */
export function buildCapiPayload(event: MarketingEvent, options: CapiPayloadOptions = {}) {
  const name = metaCapiEventName(event.eventName)
  const customData = toMetaCustomData(event)
  if (!name || !customData) return null

  const userData = buildUserData(event)
  // fbc from the click id when the cookie is not there
  if (!userData.fbc) {
    const fbc = fbcFromClickId(event.fbclid, event.timestamp)
    if (fbc) userData.fbc = fbc
  }

  return {
    data: [
      {
        event_name: name,
        event_time: Math.floor(event.timestamp / 1000),
        event_id: event.eventId,
        action_source: 'website',
        ...(event.pageUrl ? { event_source_url: event.pageUrl } : {}),
        user_data: userData,
        custom_data: customData,
      },
    ],
    ...(options.testEventCode ? { test_event_code: options.testEventCode } : {}),
  }
}
