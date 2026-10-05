import type { UtmParams } from './events'

/**
 * Campaign attribution, the minimum needed to answer later "which campaign / ad
 * brought this order". The shop had no UTM handling before; this only captures the
 * standard parameters from the landing URL and keeps them for the event payload.
 * Reporting and a full attribution model are a later phase.
 *
 * Ad ids travel in the standard fields: utm_campaign = campaign, utm_term = ad set,
 * utm_content = ad (the usual Meta dynamic-URL setup), so no custom keys are needed.
 */

const MAX_LEN = 200

const clean = (v: string | null): string | undefined => {
  const s = (v ?? '').trim().slice(0, MAX_LEN)
  return s || undefined
}

/** Campaign parameters of a URL query string, or null when it carries none */
export function parseAttribution(search: string): UtmParams | null {
  const q = new URLSearchParams(search)
  const out: UtmParams = {
    utmSource: clean(q.get('utm_source')),
    utmMedium: clean(q.get('utm_medium')),
    utmCampaign: clean(q.get('utm_campaign')),
    utmTerm: clean(q.get('utm_term')),
    utmContent: clean(q.get('utm_content')),
    fbclid: clean(q.get('fbclid')),
    gclid: clean(q.get('gclid')),
  }
  for (const key of Object.keys(out) as Array<keyof UtmParams>) {
    if (out[key] === undefined) delete out[key]
  }
  return Object.keys(out).length > 0 ? out : null
}

const LAST_TOUCH_KEY = 'zuulab_attr_last'
const FIRST_TOUCH_KEY = 'zuulab_attr_first'

function read(key: string): UtmParams | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as UtmParams) : null
  } catch {
    return null
  }
}

function write(key: string, value: UtmParams): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: attribution is simply not kept
  }
}

/**
 * Keeps the campaign parameters of the current URL (call only with analytics/marketing
 * consent). The last touch is overwritten by every campaign visit; the first touch is
 * set once.
 */
export function captureAttribution(search: string): void {
  const found = parseAttribution(search)
  if (!found) return
  write(LAST_TOUCH_KEY, found)
  if (!read(FIRST_TOUCH_KEY)) write(FIRST_TOUCH_KEY, found)
}

/** The attribution to put on events: the last campaign touch */
export function getAttribution(): UtmParams {
  return read(LAST_TOUCH_KEY) ?? {}
}

export function getFirstTouchAttribution(): UtmParams {
  return read(FIRST_TOUCH_KEY) ?? {}
}
