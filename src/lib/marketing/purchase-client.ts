'use client'

import { getConsent } from '@/lib/consent'
import { dispatchBrowserEvent } from './client'
import type { MarketingEvent } from './events'

const SENT_KEY = 'zuulab_purchase_sent'
const KEEP = 20

function alreadySent(eventId: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(SENT_KEY) || '[]') as string[]
    return Array.isArray(list) && list.includes(eventId)
  } catch {
    return false
  }
}

function markSent(eventId: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(SENT_KEY) || '[]') as string[]
    const next = [...(Array.isArray(list) ? list : []), eventId].slice(-KEEP)
    localStorage.setItem(SENT_KEY, JSON.stringify(next))
  } catch {
    // storage blocked: the destination's own dedupe (transaction id / event id) still applies
  }
}

/**
 * Sends the browser copy of an order's purchase from the order-success page. The event
 * is fetched from the server, which builds it from the stored order and refuses unless
 * the order is a real sale, so the page cannot invent or inflate a purchase. A reload
 * of the page does not repeat it. Never throws.
 */
export async function trackPurchaseForOrder(orderNumber: string): Promise<void> {
  try {
    const res = await fetch(`/api/marketing/purchase?order=${encodeURIComponent(orderNumber)}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { success?: boolean; event?: MarketingEvent }
    const event = data.success ? data.event : undefined
    if (!event || event.eventName !== 'purchase' || alreadySent(event.eventId)) return
    dispatchBrowserEvent(event)
    // Without consent nothing was sent, so keep it open for a later visit that has consent
    if (getConsent() === 'all') markSent(event.eventId)
  } catch {
    // tracking must never break the success page
  }
}
