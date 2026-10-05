import 'server-only'
import { getProductsByIds } from '@/lib/services/catalog/catalog.service'
import type { MarketingEvent } from './events'

/**
 * Adds each item's category (from the catalog) to an event built from an order, because
 * order lines do not store it. GA4 reports by item category: without this a purchase
 * would show as "(not set)" while the same product's view and add-to-cart carry one.
 * Best effort: any failure returns the event unchanged.
 */
export async function withItemCategories<T extends Pick<MarketingEvent, 'items'>>(event: T): Promise<T> {
  try {
    if (!event.items || event.items.length === 0) return event
    const products = await getProductsByIds([...new Set(event.items.map((i) => i.productId))])
    const category = new Map(products.map((p) => [p.id, p.categoryName]))
    return {
      ...event,
      items: event.items.map((i) => (i.category || !category.get(i.productId) ? i : { ...i, category: category.get(i.productId) })),
    }
  } catch {
    return event
  }
}
