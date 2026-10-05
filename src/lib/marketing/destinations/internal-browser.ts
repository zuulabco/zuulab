import type { Destination } from '../dispatcher'
import { NOT_STORED } from '@/lib/analytics/internal'

/**
 * Sends the browser's events to ZUULAB's own analytics (POST /api/marketing/collect). Like
 * every analytics destination it only runs with the "all" cookie choice, and the server
 * checks the consent cookie again. `purchase` is not sent: sales are read from orders.
 */
export const internalBrowserDestination: Destination = {
  id: 'internal-analytics',
  consent: 'analytics',
  accepts: (event) => event.source === 'browser' && !NOT_STORED.has(event.eventName),
  async send(event) {
    await fetch('/api/marketing/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    })
  },
}
