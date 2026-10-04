'use client'

import { useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cartStore'
import { trackItems } from '@/lib/analytics/gtag'

/**
 * Sends a GA4 cart event (view_cart, begin_checkout) once per page visit, as soon
 * as the saved cart has been restored from storage and holds something.
 */
export function useTrackCartEvent(event: 'view_cart' | 'begin_checkout') {
  const items = useCartStore((s) => s.items)
  const coupon = useCartStore((s) => s.coupon)
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || items.length === 0) return
    sent.current = true
    trackItems(
      event,
      items.map((i) => ({ id: i.productId, sku: i.sku, name: i.name, price: i.price, quantity: i.quantity, variant: i.variantLabel })),
      coupon ? { coupon: coupon.code } : {}
    )
  }, [event, items, coupon])
}
