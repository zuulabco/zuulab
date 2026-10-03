'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_SHIPPING_METHOD,
  FREE_SHIPPING_THRESHOLD,
  type ShippingMethod,
} from '@/lib/services/shipping.service'

export interface ShippingConfig {
  freeShippingThreshold: number
  method: ShippingMethod
}

let cached: ShippingConfig | null = null
let inflight: Promise<ShippingConfig | null> | null = null

function load(): Promise<ShippingConfig | null> {
  inflight ??= fetch('/api/shipping/threshold', { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success || typeof data.freeShippingThreshold !== 'number') return null
      cached = { freeShippingThreshold: data.freeShippingThreshold, method: data.method ?? DEFAULT_SHIPPING_METHOD }
      return cached
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * The delivery method and free-shipping threshold set in the admin panel. Shared by
 * the cart drawer, cart page, checkout and product page; fetched once per page load.
 */
export function useShippingConfig(): ShippingConfig {
  const [config, setConfig] = useState<ShippingConfig>(
    () => cached ?? { freeShippingThreshold: FREE_SHIPPING_THRESHOLD, method: DEFAULT_SHIPPING_METHOD }
  )

  useEffect(() => {
    let alive = true
    load().then((c) => {
      if (alive && c) setConfig(c)
    })
    return () => {
      alive = false
    }
  }, [])

  return config
}
