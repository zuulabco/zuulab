'use client'

import { useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cartStore'
import { trackItems } from '@/lib/analytics/gtag'
import { trackEvent } from '@/lib/marketing/client'
import { cartLineToItem } from '@/lib/marketing/cart'
import { sumItems } from '@/lib/marketing/events'

/**
 * Sends a cart event once per page visit, as soon as the saved cart has been restored
 * from storage and holds something. `begin_checkout` is a canonical event; `view_cart`
 * is a GA4-only report event with no counterpart in the shared model, so it stays on the
 * GA4 layer.
 */
export function useTrackCartEvent(event: 'view_cart' | 'begin_checkout') {
  const items = useCartStore((s) => s.items)
  const coupon = useCartStore((s) => s.coupon)
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || items.length === 0) return
    sent.current = true
    if (event === 'begin_checkout') {
      const lines = items.map(cartLineToItem)
      trackEvent('begin_checkout', { items: lines, value: sumItems(lines), ...(coupon ? { coupon: coupon.code } : {}) })
      return
    }
    trackItems(
      event,
      items.map((i) => ({ id: i.productId, sku: i.sku, name: i.name, price: i.price, quantity: i.quantity, variant: i.variantLabel })),
      coupon ? { coupon: coupon.code } : {}
    )
  }, [event, items, coupon])
}
