'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'

export interface CartQuoteIssue {
  productId: string
  variantId: string | null
  code: 'UNAVAILABLE' | 'INSUFFICIENT_STOCK' | 'INVALID_QUANTITY'
  available: number
  message: string
}

/** Client view of the server's CartQuote (src/lib/services/checkout/pricing.service.ts). */
export interface CartQuoteView {
  lines: Array<{
    productId: string
    variantId: string | null
    unitPrice: number
    quantity: number
    lineTotal: number
    availableStock: number
  }>
  issues: CartQuoteIssue[]
  subtotal: number
  discountAmount: number
  campaignDiscount?: number
  couponDiscount?: number
  campaign?: { id: string; name: string; type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'; label: string } | null
  shippingMethod: 'STANDARD' | 'EXPRESS'
  shippingAmount: number
  taxAmount: number
  total: number
  freeShippingThreshold: number
  remainingForFreeShipping: number
  coupon: { code: string; type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' } | null
  couponError?: string
}

interface QuoteInput {
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>
  couponCode?: string | null
  shippingMethod?: 'STANDARD' | 'EXPRESS'
}

/**
 * Fetches the authoritative price of the cart from the server. Pages render these
 * numbers instead of computing totals themselves, so the amount shown is exactly the
 * amount checkout charges. Requests are debounced and stale responses are dropped.
 */
export function useCartQuote(input: QuoteInput, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const token = useAuthStore((s) => s.token)
  const [quote, setQuote] = useState<CartQuoteView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const body = JSON.stringify({
    items: input.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity })),
    couponCode: input.couponCode || null,
    shippingMethod: input.shippingMethod || 'STANDARD',
  })

  const fetchQuote = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      })
      const data = await res.json()
      if (id !== requestId.current) return
      if (data.success) {
        setQuote(data.data as CartQuoteView)
        setError(null)
      } else {
        setError(data.error || 'Sepet tutarı hesaplanamadı.')
      }
    } catch {
      if (id === requestId.current) setError('Sepet tutarı hesaplanamadı. Bağlantınızı kontrol edin.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [body, token])

  useEffect(() => {
    if (!enabled) return
    const handle = setTimeout(fetchQuote, 250)
    return () => clearTimeout(handle)
  }, [enabled, fetchQuote])

  return { quote, loading, error, refresh: fetchQuote, setQuote }
}
